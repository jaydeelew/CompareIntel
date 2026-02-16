"""
Locust load testing for CompareIntel API.

Tests API performance under concurrent load for critical endpoints:
- Health check (baseline)
- Authentication flow
- Rate limit status
- Model listing
- Compare-stream (SSE) initiation

Run locally:
    cd backend
    locust -f tests/load/locustfile.py --headless -u 50 -r 10 --run-time 60s --host http://localhost:8000

Run in CI (see performance.yml):
    locust -f tests/load/locustfile.py --headless -u 20 -r 5 --run-time 30s \
        --host http://localhost:8000 --csv=load-test-results --html=load-test-report.html
"""

import random
import string

from locust import HttpUser, between, events, task


class HealthCheckUser(HttpUser):
    """
    Simulates users hitting lightweight endpoints.
    Tests baseline API responsiveness under load.
    """

    weight = 3  # Higher weight = more instances of this user type
    wait_time = between(0.5, 2)

    @task(5)
    def health_check(self):
        """Hit the health endpoint — should always be fast."""
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code == 200:
                data = response.json()
                if data.get("status") != "healthy":
                    response.failure(f"Health check returned unhealthy: {data}")
            else:
                response.failure(f"Health check failed with status {response.status_code}")

    @task(3)
    def root_endpoint(self):
        """Hit the root endpoint."""
        self.client.get("/")

    @task(2)
    def rate_limit_status(self):
        """Check rate limit status endpoint."""
        self.client.get("/api/rate-limit-status")

    @task(2)
    def get_models(self):
        """Fetch available models list."""
        self.client.get("/api/models")


class AuthenticatedUser(HttpUser):
    """
    Simulates authenticated users performing typical actions.
    Tests auth flow and authenticated endpoint performance.
    """

    weight = 2
    wait_time = between(1, 3)

    def on_start(self):
        """Register and login a unique user for this simulated session."""
        self.email = f"loadtest_{''.join(random.choices(string.ascii_lowercase, k=8))}@test.com"
        self.password = "LoadTest_Password_123!"
        self.access_token = None

        # Register
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": self.email,
                "password": self.password,
                "confirm_password": self.password,
            },
            name="/api/auth/register",
        )

        if register_response.status_code in [200, 201]:
            # Login
            login_response = self.client.post(
                "/api/auth/login",
                json={"email": self.email, "password": self.password},
                name="/api/auth/login",
            )
            if login_response.status_code == 200:
                data = login_response.json()
                self.access_token = data.get("access_token")

    @property
    def auth_headers(self):
        if self.access_token:
            return {"Authorization": f"Bearer {self.access_token}"}
        return {}

    @task(3)
    def get_rate_limit_status_authenticated(self):
        """Check rate limit status as authenticated user."""
        self.client.get(
            "/api/rate-limit-status",
            headers=self.auth_headers,
            name="/api/rate-limit-status [auth]",
        )

    @task(2)
    def get_models_authenticated(self):
        """Fetch models as authenticated user."""
        self.client.get(
            "/api/models",
            headers=self.auth_headers,
            name="/api/models [auth]",
        )

    @task(2)
    def get_conversations(self):
        """Fetch conversation list."""
        if self.access_token:
            self.client.get(
                "/api/conversations",
                headers=self.auth_headers,
                name="/api/conversations [auth]",
            )

    @task(1)
    def estimate_tokens(self):
        """Test token estimation endpoint."""
        if self.access_token:
            self.client.post(
                "/api/estimate-tokens",
                json={
                    "input_data": "What is the meaning of life?",
                    "models": ["anthropic/claude-3.5-haiku"],
                },
                headers=self.auth_headers,
                name="/api/estimate-tokens [auth]",
            )

    @task(1)
    def initiate_compare_stream(self):
        """
        Test compare-stream endpoint initiation.
        We don't consume the full SSE stream — just verify the endpoint
        responds with 200 and starts streaming (or returns 402/429 as expected).
        """
        if self.access_token:
            with self.client.post(
                "/api/compare-stream",
                json={
                    "input_data": "Hello, how are you?",
                    "models": ["anthropic/claude-3.5-haiku"],
                },
                headers=self.auth_headers,
                name="/api/compare-stream [auth]",
                catch_response=True,
                stream=True,
            ) as response:
                if response.status_code in [200, 402, 429]:
                    response.success()
                else:
                    response.failure(f"Unexpected status: {response.status_code}")
                # Close the stream immediately — we only care about initiation latency
                response.close()


class AnonymousComparisonUser(HttpUser):
    """
    Simulates unauthenticated users trying to use the compare endpoint.
    Tests anonymous rate limiting under load.
    """

    weight = 1
    wait_time = between(2, 5)

    @task(3)
    def health_check(self):
        """Baseline health check."""
        self.client.get("/health")

    @task(2)
    def rate_limit_check(self):
        """Check anonymous rate limit status."""
        self.client.get("/api/rate-limit-status")

    @task(1)
    def attempt_compare(self):
        """Attempt comparison as anonymous user (should be rate-limited quickly)."""
        with self.client.post(
            "/api/compare-stream",
            json={
                "input_data": "Test prompt",
                "models": ["anthropic/claude-3.5-haiku"],
            },
            name="/api/compare-stream [anon]",
            catch_response=True,
            stream=True,
        ) as response:
            # Anonymous users may get 200, 402, or 429 — all are valid
            if response.status_code in [200, 402, 429]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")
            response.close()


@events.quitting.add_listener
def check_fail_ratio(environment, **kwargs):
    """
    Fail the CI run if error rate exceeds threshold.
    This ensures load tests actually gate deployments.
    """
    stats = environment.runner.stats.total
    if stats.num_requests == 0:
        return

    fail_ratio = stats.num_failures / stats.num_requests
    if fail_ratio > 0.10:  # More than 10% failure rate
        print(f"❌ Load test FAILED: {fail_ratio:.1%} error rate (threshold: 10%)")
        environment.process_exit_code = 1
    else:
        print(f"✅ Load test PASSED: {fail_ratio:.1%} error rate (threshold: 10%)")


@events.quitting.add_listener
def check_response_times(environment, **kwargs):
    """
    Fail if p95 response time for health endpoint exceeds threshold.
    """
    for name, stats_entry in environment.runner.stats.entries.items():
        entry_name, entry_method = name
        if entry_name == "/health" and entry_method == "GET":
            p95 = stats_entry.get_response_time_percentile(0.95) or 0
            if p95 > 500:  # p95 > 500ms for health check is unacceptable
                print(f"❌ Health endpoint p95 too slow: {p95}ms (threshold: 500ms)")
                environment.process_exit_code = 1
            else:
                print(f"✅ Health endpoint p95: {p95}ms (threshold: 500ms)")
            break

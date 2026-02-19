FROM python:3.11-slim

# Accept build argument
ARG ENVIRONMENT=production
ENV ENVIRONMENT=${ENVIRONMENT}

WORKDIR /app

# Install system dependencies and create temp directories
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp /var/tmp /usr/tmp

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["/entrypoint.sh"] 
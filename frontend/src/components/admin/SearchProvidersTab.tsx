import React, { useState, useEffect, useCallback } from 'react'

import {
  getSearchProviders,
  setActiveSearchProvider,
  testSearchProvider,
  testSearchProviderWithQuery,
  type SearchProvidersResponse,
  type SearchProviderTestResult,
} from '../../services/adminService'
import logger from '../../utils/logger'

interface SearchProvidersTabProps {
  setError: (err: string | null) => void
}

const SearchProvidersTab: React.FC<SearchProvidersTabProps> = ({ setError }) => {
  const [searchProviders, setSearchProviders] = useState<SearchProvidersResponse | null>(null)
  const [searchProvidersLoading, setSearchProvidersLoading] = useState(false)
  const [testingProvider, setTestingProvider] = useState(false)
  const [settingActiveProvider, setSettingActiveProvider] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('test query')
  const [testResult, setTestResult] = useState<SearchProviderTestResult | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [messageSuccess, setMessageSuccess] = useState<string | null>(null)

  const fetchSearchProviders = useCallback(async () => {
    try {
      setSearchProvidersLoading(true)
      const data = await getSearchProviders()
      setSearchProviders(data)
    } catch (err) {
      logger.error('Error fetching search providers:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch search providers')
    } finally {
      setSearchProvidersLoading(false)
    }
  }, [setError])

  useEffect(() => {
    fetchSearchProviders()
  }, [fetchSearchProviders])

  const handleSetActiveProvider = async (provider: string) => {
    try {
      setSettingActiveProvider(provider)
      await setActiveSearchProvider(provider)
      await fetchSearchProviders()
      setMessageSuccess(`Active search provider set to ${provider}`)
      setTimeout(() => setMessageSuccess(null), 5000)
    } catch (err) {
      logger.error('Error setting active provider:', err)
      setMessageError(err instanceof Error ? err.message : 'Failed to set active provider')
      setTimeout(() => setMessageError(null), 5000)
    } finally {
      setSettingActiveProvider(null)
    }
  }

  const handleTestProvider = async (provider?: string, query?: string) => {
    try {
      setTestingProvider(true)
      setTestResult(null)
      const result =
        provider && query
          ? await testSearchProviderWithQuery(provider, query)
          : await testSearchProvider()
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        provider: provider || 'unknown',
        error: err instanceof Error ? err.message : 'Failed to test provider',
      })
    } finally {
      setTestingProvider(false)
    }
  }

  return (
    <div className="search-providers-management">
      <div className="search-providers-management-header">
        <h2>Search Providers</h2>
        <button
          className="refresh-providers-btn"
          onClick={fetchSearchProviders}
          disabled={searchProvidersLoading}
        >
          {searchProvidersLoading ? (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Loading...
            </>
          ) : (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              Refresh
            </>
          )}
        </button>
      </div>

      {searchProvidersLoading && !searchProviders && (
        <div className="loading-message">
          <p>Loading search providers...</p>
        </div>
      )}

      {messageError && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--error-bg, #fee)',
            border: '1px solid var(--error-color, #dc3545)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--error-color, #dc3545)',
            fontSize: '0.875rem',
          }}
        >
          {messageError}
        </div>
      )}
      {messageSuccess && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--success-bg, #efe)',
            border: '1px solid var(--success-color, #28a745)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--success-color, #28a745)',
            fontSize: '0.875rem',
          }}
        >
          {messageSuccess}
        </div>
      )}

      {searchProviders && (
        <>
          <div className="providers-list">
            {searchProviders.providers.map(provider => (
              <div
                key={provider.name}
                className="provider-card"
                style={{
                  padding: '1.5rem',
                  marginBottom: '1rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  opacity: !searchProviders.is_development && !provider.is_active ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {provider.display_name}
                      {provider.is_active && (
                        <span
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'var(--success-color, #28a745)',
                            color: 'white',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                          }}
                        >
                          Active
                        </span>
                      )}
                    </h3>
                    <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)' }}>
                      {provider.is_configured ? (
                        <span style={{ color: 'var(--success-color, #28a745)' }}>
                          ✓ API key configured
                        </span>
                      ) : (
                        <span style={{ color: 'var(--error-color, #dc3545)' }}>
                          ✗ API key not configured
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleSetActiveProvider(provider.name)}
                      disabled={
                        !provider.is_configured ||
                        provider.is_active ||
                        settingActiveProvider === provider.name
                      }
                      className="set-active-btn"
                      style={{
                        padding: '0.5rem 1rem',
                        background:
                          provider.is_active ||
                          !provider.is_configured ||
                          settingActiveProvider === provider.name
                            ? 'var(--bg-disabled)'
                            : 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor:
                          provider.is_active ||
                          !provider.is_configured ||
                          settingActiveProvider === provider.name
                            ? 'not-allowed'
                            : 'pointer',
                        opacity:
                          provider.is_active ||
                          !provider.is_configured ||
                          settingActiveProvider === provider.name
                            ? 0.6
                            : 1,
                      }}
                      title={
                        provider.is_active
                          ? 'Already active'
                          : !provider.is_configured
                            ? 'API key not configured'
                            : settingActiveProvider === provider.name
                              ? 'Setting active provider...'
                              : 'Set as active provider'
                      }
                    >
                      {settingActiveProvider === provider.name
                        ? 'Setting...'
                        : provider.is_active
                          ? 'Active'
                          : 'Set Active'}
                    </button>
                    <button
                      onClick={() => handleTestProvider(provider.name, testQuery)}
                      disabled={!provider.is_configured || testingProvider}
                      className="test-provider-btn"
                      style={{
                        padding: '0.5rem 1rem',
                        background: provider.is_configured
                          ? 'var(--primary-color)'
                          : 'var(--bg-disabled)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: provider.is_configured ? 'pointer' : 'not-allowed',
                        opacity: provider.is_configured ? 1 : 0.6,
                      }}
                      title={provider.is_configured ? 'Test provider' : 'API key not configured'}
                    >
                      Test
                    </button>
                  </div>
                </div>

                {provider.is_configured && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={testQuery}
                      onChange={e => setTestQuery(e.target.value)}
                      placeholder="Enter test query..."
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    />
                    <button
                      onClick={() => handleTestProvider(provider.name, testQuery)}
                      disabled={testingProvider || !testQuery.trim()}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: testingProvider || !testQuery.trim() ? 'not-allowed' : 'pointer',
                        opacity: testingProvider || !testQuery.trim() ? 0.6 : 1,
                      }}
                    >
                      Test Query
                    </button>
                  </div>
                )}

                {testResult && testResult.provider === provider.name && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      background: testResult.success
                        ? 'var(--bg-success, #d4edda)'
                        : 'var(--bg-error, #f8d7da)',
                      border: `1px solid ${testResult.success ? 'var(--success-color, #28a745)' : 'var(--error-color, #dc3545)'}`,
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    {testResult.success ? (
                      <>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 'bold',
                            color: 'var(--success-color, #28a745)',
                          }}
                        >
                          ✓ Test successful - {testResult.results_count} results found
                        </p>
                        {testResult.results && testResult.results.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            {testResult.results.slice(0, 3).map((result, idx) => (
                              <div
                                key={idx}
                                style={{
                                  marginTop: '0.5rem',
                                  padding: '0.5rem',
                                  background: 'white',
                                  borderRadius: 'var(--radius-sm)',
                                }}
                              >
                                <a
                                  href={result.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}
                                >
                                  {result.title}
                                </a>
                                <p
                                  style={{
                                    margin: '0.25rem 0 0 0',
                                    fontSize: '0.9rem',
                                    color: '#666',
                                  }}
                                >
                                  {result.snippet}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--error-color, #dc3545)' }}>
                        ✗ Test failed: {testResult.error || 'Unknown error'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {searchProviders.active_provider && (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: 'var(--bg-info, #d1ecf1)',
                border: '1px solid var(--info-color, #17a2b8)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-info, #0c5460)',
              }}
            >
              <strong>Current Active Provider:</strong> {searchProviders.active_provider}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SearchProvidersTab

/**
 * Flag native tool-call markup that a model printed as answer text.
 *
 * The rendering prompts never enable tools, so this is a regression guard on
 * captured replies rather than a web-search suite. Format ids match
 * backend/app/llm/leaked_tool_markup.py closely enough to catch the same leaks.
 */

const CHECKS: Array<[string, RegExp]> = [
  ['deepseek_dsml', /<\s*(?:\||\uFF5C)\s*DSML\s*(?:\||\uFF5C)/i],
  ['deepseek_v3', /<\s*(?:\||\uFF5C)\s*tool[\u2581_]call/i],
  ['kimi_tool_section', /<\|tool_calls_section_begin\|>|<\|tool_call_argument_begin\|>/],
  ['llama_python_tag', /<\|python_tag\|>/],
  ['llama_function', /<function=/i],
  ['mistral_tool_calls', /\[TOOL_CALLS\]/i],
  ['qwen_hermes_tool_call', /<tool_call\b/i],
  ['xml_function_calls', /<function_calls\b/i],
  ['xml_invoke', /<invoke\b[^>\n]*\bname\s*=/i],
  ['bare_json', /"name"\s*:\s*"(?:search_web|fetch_url)"/],
  ['deepseek_control', /<\s*(?:\||\uFF5C)\s*(?:begin|end)[\u2581_]of[\u2581_]sentence/i],
]

export function findToolLeakFormats(text: string | null | undefined): string[] {
  if (!text) return []
  return CHECKS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id)
}

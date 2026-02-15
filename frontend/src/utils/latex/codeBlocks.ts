const RECOGNIZED_LANGUAGES = new Set([
  'javascript',
  'js',
  'typescript',
  'ts',
  'python',
  'py',
  'java',
  'c',
  'cpp',
  'c++',
  'csharp',
  'c#',
  'cs',
  'go',
  'rust',
  'ruby',
  'rb',
  'php',
  'swift',
  'kotlin',
  'scala',
  'r',
  'perl',
  'lua',
  'dart',
  'elixir',
  'erlang',
  'haskell',
  'clojure',
  'fsharp',
  'f#',
  'ocaml',
  'julia',
  'zig',
  'nim',
  'crystal',
  'html',
  'css',
  'scss',
  'sass',
  'less',
  'jsx',
  'tsx',
  'vue',
  'svelte',
  'xml',
  'svg',
  'json',
  'yaml',
  'yml',
  'toml',
  'graphql',
  'wasm',
  'bash',
  'sh',
  'shell',
  'zsh',
  'fish',
  'powershell',
  'ps1',
  'batch',
  'bat',
  'cmd',
  'sql',
  'mysql',
  'postgresql',
  'sqlite',
  'mongodb',
  'redis',
  'cassandra',
  'markdown',
  'md',
  'latex',
  'tex',
  'dockerfile',
  'docker',
  'nginx',
  'apache',
  'makefile',
  'make',
  'cmake',
  'gradle',
  'maven',
  'csv',
  'ini',
  'properties',
  'env',
  'regex',
  'diff',
  'git',
  'http',
  'asm',
  'assembly',
  'wgsl',
  'glsl',
  'hlsl',
  'cuda',
  'opencl',
  'vhdl',
  'verilog',
  'systemverilog',
  'tcl',
  'prolog',
  'scheme',
  'lisp',
  'racket',
  'elm',
  'purescript',
  'reason',
  'rescript',
  'solidity',
  'vyper',
  'move',
  'cairo',
  'terraform',
  'hcl',
  'puppet',
  'ansible',
  'nix',
  'dhall',
  'jsonnet',
  'cue',
  'protobuf',
  'proto',
  'thrift',
  'avro',
  'capnproto',
  'flatbuffers',
])

const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  yml: 'yaml',
  html: 'markup',
  xml: 'markup',
  'c++': 'clike',
  cpp: 'clike',
  'c#': 'csharp',
  cs: 'csharp',
}

export function renderCodeBlock(language: string, code: string): string {
  const lang = language || ''
  const cleanCode = code.replace(/^\n+|\n+$/g, '')

  const isRecognizedLanguage = lang && RECOGNIZED_LANGUAGES.has(lang.toLowerCase())

  const prismLang = isRecognizedLanguage
    ? LANGUAGE_MAP[lang.toLowerCase()] || lang.toLowerCase()
    : 'none'

  const escapedCode = cleanCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const base64Code =
    typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(cleanCode))) : ''

  if (!isRecognizedLanguage) {
    return `
            <div class="preformatted-text" data-code-base64="${base64Code}" style="
                background: #f6f8fa;
                border: 1px solid #d0d7de;
                border-radius: 6px;
                padding: 16px;
                margin: 16px 0;
                overflow-x: auto;
                font-size: 14px;
                line-height: 1.5;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                white-space: pre-wrap;
                word-wrap: break-word;
                color: #1f2328;
            "><code style="font-family: inherit; background: none; padding: 0;">${escapedCode}</code></div>
        `
  }

  return `
            <div class="code-block-direct" data-language="${lang}" data-code-base64="${base64Code}" style="
                background: #0d1117;
                border: 1px solid #30363d;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                overflow-x: auto;
                font-size: 14px;
                line-height: 1.5;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                position: relative;
            ">
                <div class="code-block-header" style="
                    position: absolute;
                    top: 8px;
                    left: 12px;
                    right: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    pointer-events: none;
                    z-index: 1;
                ">
                    <span class="code-language-label" style="
                        font-size: 11px;
                        color: #7d8590;
                        text-transform: uppercase;
                        font-weight: 600;
                        background: rgba(125, 133, 144, 0.15);
                        padding: 0.25rem 0.5rem;
                        border-radius: 3px;
                        letter-spacing: 0.5px;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    ">${lang}</span>
                    <button class="code-copy-btn" onclick="(function(btn){try{const base64=btn.parentElement.parentElement.getAttribute('data-code-base64');const code=decodeURIComponent(escape(atob(base64)));navigator.clipboard.writeText(code).then(()=>{const origHTML=btn.innerHTML;btn.innerHTML='<svg width=\\'14\\' height=\\'14\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><polyline points=\\'20 6 9 17 4 12\\'></polyline></svg>';btn.style.color='#3fb950';setTimeout(()=>{btn.innerHTML=origHTML;btn.style.color='#7d8590';},2000);}).catch(e=>console.error(e));}catch(e){console.error('Copy error:',e);}})(this)" style="
                        pointer-events: auto;
                        background: none;
                        border: none;
                        color: #7d8590;
                        cursor: pointer;
                        padding: 0.25rem;
                        border-radius: 4px;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 24px;
                        height: 24px;
                    " onmouseover="this.style.background='rgba(125, 133, 144, 0.15)'; this.style.color='#e6edf3';" onmouseout="if(!this.style.color.includes('3fb950')){this.style.background='none';this.style.color='#7d8590';}" title="Copy code">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    </button>
                </div>
                <pre class="language-${prismLang}" style="margin: 0; margin-top: 28px; white-space: pre; word-wrap: normal; overflow-wrap: normal;"><code class="language-${prismLang}">${escapedCode}</code></pre>
            </div>
        `
}

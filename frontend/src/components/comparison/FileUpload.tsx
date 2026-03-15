import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react'

import { showNotification } from '../../utils/error'
import logger from '../../utils/logger'
import { StyledTooltip } from '../shared'

export interface AttachedFile {
  id: string
  file: File
  name: string
  placeholder: string
  /** Base64 data for image files (used by vision-capable models) */
  base64Data?: string
  /** MIME type for image files, e.g. image/png */
  mimeType?: string
}

export interface StoredAttachedFile {
  id: string
  name: string
  placeholder: string
  content: string
}

export interface FileUploadProps {
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  setAttachedFiles: (files: (AttachedFile | StoredAttachedFile)[]) => void
  input: string
  setInput: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  /** When true, tooltip is hidden (used for mobile layout) */
  isMobileLayout?: boolean
}

export interface FileUploadHandle {
  processFile: (file: File) => Promise<boolean>
}

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

/** Threshold above which we warn about large image size and credit costs (1 MB) */
const LARGE_IMAGE_THRESHOLD_BYTES = 1024 * 1024

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isImageFile = (file: File): boolean => {
  const mime = file.type?.toLowerCase()
  const name = file.name.toLowerCase()
  return (
    (mime &&
      IMAGE_MIME_TYPES.some(
        t => mime.startsWith('image/') && (mime.includes(t.split('/')[1]) || mime === t)
      )) ||
    IMAGE_EXTENSIONS.some(e => name.endsWith(e))
  )
}

const isDocumentFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase()
  const mimeType = file.type.toLowerCase()
  const documentExtensions = ['.pdf', '.docx', '.doc', '.rtf', '.odt', '.txt']
  const documentMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'text/rtf',
  ]
  return (
    documentExtensions.some(ext => fileName.endsWith(ext)) ||
    documentMimeTypes.some(type => mimeType.includes(type))
  )
}

const TEXT_MIME_TYPES = [
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/xml',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/javascript',
  'application/xml',
  'application/x-sh',
  'application/x-python',
  'application/x-httpd-php',
  'application/x-java-source',
  'application/x-c',
  'application/x-c++',
  'application/x-csharp',
  'application/x-ruby',
  'application/x-go',
  'application/x-rust',
  'application/x-swift',
  'application/x-kotlin',
  'application/x-typescript',
  'application/x-yaml',
  'application/x-toml',
  'application/x-ini',
  'application/x-shellscript',
]

const TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.go',
  '.rs',
  '.swift',
  '.kt',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.log',
  '.csv',
  '.sql',
  '.r',
  '.R',
  '.m',
  '.pl',
  '.pm',
  '.lua',
  '.scala',
  '.clj',
  '.cljs',
  '.hs',
  '.elm',
  '.ex',
  '.exs',
  '.dart',
  '.vue',
  '.svelte',
  '.astro',
  '.graphql',
  '.gql',
  '.dockerfile',
  '.env',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.eslintrc',
  '.prettierrc',
  '.babelrc',
  '.webpack',
  '.rollup',
  '.vite',
  '.makefile',
  '.cmake',
  '.gradle',
  '.maven',
  '.pom',
  '.sbt',
  '.build',
  '.lock',
  '.lockfile',
  '.package',
  '.requirements',
  '.pip',
  '.conda',
  '.dockerignore',
  '.npmignore',
  '.yarnignore',
  '.eslintignore',
  '.prettierignore',
]

async function isTextOrCodeFile(file: File): Promise<boolean> {
  if (isDocumentFile(file)) return true
  const mimeType = file.type.toLowerCase()
  if (
    mimeType &&
    TEXT_MIME_TYPES.some(type => mimeType.includes(type) || mimeType.startsWith(type))
  ) {
    return true
  }
  const fileName = file.name.toLowerCase()
  if (TEXT_EXTENSIONS.some(ext => fileName.endsWith(ext))) return true

  try {
    const firstBytes = await file.slice(0, 512).arrayBuffer()
    const uint8Array = new Uint8Array(firstBytes)
    if (
      uint8Array.length >= 3 &&
      uint8Array[0] === 0xef &&
      uint8Array[1] === 0xbb &&
      uint8Array[2] === 0xbf
    ) {
      return true
    }
    if (
      uint8Array.length >= 2 &&
      ((uint8Array[0] === 0xff && uint8Array[1] === 0xfe) ||
        (uint8Array[0] === 0xfe && uint8Array[1] === 0xff))
    ) {
      return true
    }
    let printableCount = 0
    for (let i = 0; i < Math.min(uint8Array.length, 256); i++) {
      const byte = uint8Array[i]
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        printableCount++
      }
    }
    const printableRatio = printableCount / Math.min(uint8Array.length, 256)
    if (printableRatio > 0.8) return true
  } catch (error) {
    logger.warn('Error reading file for type detection:', error)
  }
  return false
}

function getFileTypeLabel(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some(e => lower.endsWith(e))) return 'Image file'
  if (lower.endsWith('.pdf')) return 'PDF file'
  if (lower.endsWith('.docx')) return 'DOCX file'
  if (lower.endsWith('.py')) return 'Python file'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'JavaScript file'
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'TypeScript file'
  if (lower.endsWith('.java')) return 'Java file'
  if (['.cpp', '.cc', '.cxx', '.c'].some(ext => lower.endsWith(ext))) return 'C/C++ file'
  if (lower.endsWith('.cs')) return 'C# file'
  if (lower.endsWith('.rb')) return 'Ruby file'
  if (lower.endsWith('.go')) return 'Go file'
  if (lower.endsWith('.rs')) return 'Rust file'
  if (lower.endsWith('.php')) return 'PHP file'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'Shell script'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'HTML file'
  if (lower.endsWith('.css')) return 'CSS file'
  if (lower.endsWith('.json')) return 'JSON file'
  if (lower.endsWith('.xml')) return 'XML file'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown file'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'YAML file'
  if (lower.endsWith('.sql')) return 'SQL file'
  return 'text file'
}

const MOBILE_ACCEPT =
  'text/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf,application/json,application/javascript,application/xml,image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cc,.cxx,.h,.hpp,.cs,.rb,.go,.rs,.swift,.kt,.php,.sh,.bash,.zsh,.fish,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.csv,.sql,.r,.R,.m,.pl,.pm,.lua,.scala,.clj,.cljs,.hs,.elm,.ex,.exs,.dart,.vue,.svelte,.astro,.graphql,.gql,.dockerfile,.env,.gitignore,.gitattributes,.editorconfig,.eslintrc,.prettierrc,.babelrc,.webpack,.rollup,.vite,.makefile,.cmake,.gradle,.maven,.pom,.sbt,.build,.lock,.lockfile,.package,.requirements,.pip,.conda,.dockerignore,.npmignore,.yarnignore,.eslintignore,.prettierignore,.pdf,.docx,.doc,.rtf,.odt,.png,.jpg,.jpeg,.webp,.gif'

const DESKTOP_ACCEPT =
  '.txt,.md,.markdown,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cc,.cxx,.h,.hpp,.cs,.rb,.go,.rs,.swift,.kt,.php,.sh,.bash,.zsh,.fish,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.csv,.sql,.r,.R,.m,.pl,.pm,.lua,.scala,.clj,.cljs,.hs,.elm,.ex,.exs,.dart,.vue,.svelte,.astro,.graphql,.gql,.dockerfile,.env,.gitignore,.gitattributes,.editorconfig,.eslintrc,.prettierrc,.babelrc,.webpack,.rollup,.vite,.makefile,.cmake,.gradle,.maven,.pom,.sbt,.build,.lock,.lockfile,.package,.requirements,.pip,.conda,.dockerignore,.npmignore,.yarnignore,.eslintignore,.prettierignore,.pdf,.docx,.doc,.rtf,.odt,.png,.jpg,.jpeg,.webp,.gif,text/*,application/json,application/javascript,application/xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/rtf,application/vnd.oasis.opendocument.text,image/png,image/jpeg,image/webp,image/gif'

export const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(function FileUpload(
  {
    attachedFiles,
    setAttachedFiles,
    input,
    setInput,
    textareaRef,
    disabled = false,
    isMobileLayout = false,
  },
  ref
) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  }, [])

  const fileAcceptAttribute = isMobileDevice ? MOBILE_ACCEPT : DESKTOP_ACCEPT

  const processFile = useCallback(
    async (file: File) => {
      const isText = await isTextOrCodeFile(file)
      const isImage = isImageFile(file)
      if (!isText && !isImage) {
        showNotification(
          'Only text, code, document, and image files (PNG, JPEG, WebP, GIF) can be uploaded. Please select a supported file.',
          'error'
        )
        return false
      }

      try {
        const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const placeholder = isImage ? `[image: ${file.name}]` : `[file: ${file.name}]`
        let attachedFile: AttachedFile

        if (isImage) {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              const base64 = result.includes(',') ? result.split(',')[1] : result
              resolve(base64 || '')
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          const mimeType = file.type || 'image/png'
          attachedFile = {
            id: fileId,
            file,
            name: file.name,
            placeholder,
            base64Data,
            mimeType,
          }
        } else {
          attachedFile = {
            id: fileId,
            file,
            name: file.name,
            placeholder,
          }
        }

        setAttachedFiles([...attachedFiles, attachedFile])

        const textarea = textareaRef.current
        if (textarea) {
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          const textBefore = input.substring(0, start)
          const textAfter = input.substring(end)
          const separatorBefore = textBefore.trim() && !textBefore.endsWith('\n') ? '\n\n' : ''
          const separatorAfter = textAfter.trim() && !textAfter.startsWith('\n') ? '\n\n' : ''
          /* For images: add one space after placeholder and place cursor there */
          const trailingSpace = isImage ? ' ' : ''
          const insertion = placeholder + trailingSpace
          const newInput = textBefore + separatorBefore + insertion + separatorAfter + textAfter
          setInput(newInput)
          setTimeout(() => {
            if (textareaRef.current) {
              const newCursorPos =
                start + separatorBefore.length + insertion.length + separatorAfter.length
              textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
              textareaRef.current.focus()
            }
          }, 0)
        } else {
          const separator = input.trim() ? '\n\n' : ''
          const trailingSpace = isImage ? ' ' : ''
          setInput(input + separator + placeholder + trailingSpace)
        }

        const fileType = getFileTypeLabel(file.name)
        const notification = showNotification(
          `${fileType} "${file.name}" attached (will be expanded on submit)`,
          'success'
        )
        notification.clearAutoRemove()
        setTimeout(() => notification(), 5000)

        if (isImage && file.size > LARGE_IMAGE_THRESHOLD_BYTES) {
          const sizeStr = formatFileSize(file.size)
          const warningNotif = showNotification(
            `Large image (${sizeStr}) uses more credits. Consider compressing or resizing to reduce cost.`,
            'warning'
          )
          warningNotif.clearAutoRemove()
          setTimeout(() => warningNotif(), 8000)
        }

        return true
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Error attaching file. Please try again.'
        showNotification(errorMessage, 'error')
        logger.error('File attachment error:', error)
        return false
      }
    },
    [attachedFiles, setAttachedFiles, input, setInput, textareaRef]
  )

  useImperativeHandle(ref, () => ({ processFile }), [processFile])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      await processFile(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [processFile]
  )

  const handleUploadButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    fileInputRef.current?.click()
    e.currentTarget.blur()
  }, [])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAcceptAttribute}
        capture={isMobileDevice ? false : undefined}
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
      {!isMobileLayout && attachedFiles.length === 0 ? (
        <StyledTooltip text="Select or drag file here">
          <button
            type="button"
            onClick={handleUploadButtonClick}
            className="textarea-icon-button file-upload-button"
            disabled={disabled}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '20px', height: '20px', display: 'block' }}
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </StyledTooltip>
      ) : (
        <button
          type="button"
          onClick={handleUploadButtonClick}
          className="textarea-icon-button file-upload-button"
          disabled={disabled}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '20px', height: '20px', display: 'block' }}
          >
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  )
})

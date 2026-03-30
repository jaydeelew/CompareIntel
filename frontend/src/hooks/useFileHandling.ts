import { useCallback } from 'react'

import type { AttachedFile, StoredAttachedFile } from '../components/comparison/FileUpload'
import logger from '../utils/logger'

/**
 * Hook for handling file extraction and processing
 *
 * Provides utilities for extracting text from PDF/DOCX files and
 * expanding file placeholders in user input.
 */
export function useFileHandling() {
  // Extract text from PDF file (lazy load pdfjs-dist only when needed)
  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    try {
      // Dynamically import pdfjs-dist only when needed
      const pdfjsLib = await import('pdfjs-dist')
      const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')

      // Configure worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .filter(item => 'str' in item)
          .map(item => (item as { str: string }).str)
          .join(' ')
        fullText += pageText + '\n\n'
      }

      return fullText.trim()
    } catch (error) {
      logger.error('Error extracting text from PDF:', error)
      throw new Error('Failed to extract text from PDF file')
    }
  }, [])

  // Extract text from DOCX file (lazy load mammoth only when needed)
  const extractTextFromDOCX = useCallback(async (file: File): Promise<string> => {
    try {
      // Dynamically import mammoth only when needed
      const mammoth = await import('mammoth')
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.default.extractRawText({ arrayBuffer })
      return result.value
    } catch (error) {
      logger.error('Error extracting text from DOCX:', error)
      throw new Error('Failed to extract text from DOCX file')
    }
  }, [])

  // Expand file contents - replaces placeholders with actual file contents
  // Structures the message similar to Cursor IDE: user input separated from file contents
  const expandFiles = useCallback(
    async (files: (AttachedFile | StoredAttachedFile)[], userInput: string): Promise<string> => {
      if (files.length === 0) {
        return userInput
      }

      // Extract content from all files
      // Handle both AttachedFile (with File object) and StoredAttachedFile (with stored content)
      const fileContents: Array<{ name: string; content: string }> = []

      for (const attachedFile of files) {
        try {
          // Skip image files - keep placeholder as-is for vision models
          if ('base64Data' in attachedFile && attachedFile.base64Data) {
            continue
          }

          let content = ''

          // Check if this is a StoredAttachedFile (has content property)
          if ('content' in attachedFile && attachedFile.content) {
            // Use stored content directly
            content = attachedFile.content
          } else if ('file' in attachedFile && attachedFile.file) {
            // Extract content from File object (AttachedFile)
            const fileName = attachedFile.file.name.toLowerCase()

            // Handle PDF files
            if (fileName.endsWith('.pdf')) {
              content = await extractTextFromPDF(attachedFile.file)
            }
            // Handle DOCX files
            else if (fileName.endsWith('.docx')) {
              content = await extractTextFromDOCX(attachedFile.file)
            }
            // Handle other document types (DOC, ODT) - try as text first
            else if (fileName.endsWith('.doc') || fileName.endsWith('.odt')) {
              try {
                content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = e => resolve(e.target?.result as string)
                  reader.onerror = reject
                  reader.readAsText(attachedFile.file)
                })
              } catch {
                throw new Error(`Failed to extract text from ${attachedFile.name}`)
              }
            }
            // Handle text/code files
            else {
              content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = e => resolve(e.target?.result as string)
                reader.onerror = reject
                reader.readAsText(attachedFile.file)
              })
            }
          }

          if (content && content.trim()) {
            fileContents.push({ name: attachedFile.name, content: content.trim() })
          }
        } catch (error) {
          logger.error(`Error extracting content from ${attachedFile.name}:`, error)
          // Continue with other files even if one fails
        }
      }

      // Create a map of placeholder -> file content for quick lookup
      const fileContentMap = new Map<string, string>()
      fileContents.forEach(({ name, content }) => {
        // Find the matching attached file by name
        const attachedFile = files.find(f => f.name === name)
        if (attachedFile) {
          fileContentMap.set(attachedFile.placeholder, content)
        }
      })

      // Replace `[file: name]` tokens in the prompt when present (legacy / pasted).
      // Attachments added via chips are not inserted into the textarea; those are expanded in
      // `attachedFiles` order and appended after the user text.
      let result = userInput
      const sectionsToAppend: string[] = []

      files.forEach(attachedFile => {
        const placeholder = attachedFile.placeholder
        const content = fileContentMap.get(placeholder)

        // Skip image placeholders - keep as-is for vision-capable models
        if ('base64Data' in attachedFile && attachedFile.base64Data) {
          return
        }

        if (content) {
          const fileSection = `\n\n[FILE: ${attachedFile.name}]\n${content}\n[/FILE: ${attachedFile.name}]\n\n`
          if (result.includes(placeholder)) {
            result = result.split(placeholder).join(fileSection)
          } else {
            sectionsToAppend.push(fileSection)
          }
        } else {
          const errorSection = `\n\n[FILE: ${attachedFile.name} - extraction failed]\n\n`
          if (result.includes(placeholder)) {
            result = result.split(placeholder).join(errorSection)
          } else {
            sectionsToAppend.push(errorSection)
          }
        }
      })

      if (sectionsToAppend.length > 0) {
        const appended = sectionsToAppend.join('')
        const trimmed = result.trimEnd()
        result = trimmed.length > 0 ? `${trimmed}\n\n${appended}` : appended
      }

      // Clean up excessive newlines (more than 2 consecutive) while preserving structure
      result = result.replace(/\n{3,}/g, '\n\n')

      return result.trim()
    },
    [extractTextFromPDF, extractTextFromDOCX]
  )

  /** Get attached images for API payload (vision-capable models) */
  const getAttachedImagesForApi = useCallback(
    (files: (AttachedFile | StoredAttachedFile)[]) =>
      files
        .filter((f): f is AttachedFile => 'base64Data' in f && !!f.base64Data && 'mimeType' in f)
        .map(f => ({
          mime_type: f.mimeType || 'image/png',
          base64_data: f.base64Data || '',
          filename: f.name,
          placeholder: f.placeholder,
        })),
    []
  )

  // Helper function to extract file content from AttachedFile[] for storage
  const extractFileContentForStorage = useCallback(
    async (
      files: AttachedFile[]
    ): Promise<Array<{ name: string; content: string; placeholder: string }>> => {
      const extractedFiles: Array<{ name: string; content: string; placeholder: string }> = []

      for (const attachedFile of files) {
        try {
          // Skip image files - not stored as text content
          if ('base64Data' in attachedFile && attachedFile.base64Data) {
            continue
          }
          const fileName = attachedFile.file.name.toLowerCase()
          let content = ''

          // Handle PDF files
          if (fileName.endsWith('.pdf')) {
            content = await extractTextFromPDF(attachedFile.file)
          }
          // Handle DOCX files
          else if (fileName.endsWith('.docx')) {
            content = await extractTextFromDOCX(attachedFile.file)
          }
          // Handle other document types (DOC, ODT) - try as text first
          else if (fileName.endsWith('.doc') || fileName.endsWith('.odt')) {
            try {
              content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = e => resolve(e.target?.result as string)
                reader.onerror = reject
                reader.readAsText(attachedFile.file)
              })
            } catch {
              throw new Error(`Failed to extract text from ${attachedFile.name}`)
            }
          }
          // Handle text/code files
          else {
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = e => resolve(e.target?.result as string)
              reader.onerror = reject
              reader.readAsText(attachedFile.file)
            })
          }

          if (content && content.trim()) {
            extractedFiles.push({
              name: attachedFile.name,
              content: content.trim(),
              placeholder: attachedFile.placeholder,
            })
          }
        } catch (error) {
          logger.error(`Error extracting content from ${attachedFile.name} for storage:`, error)
          // Continue with other files even if one fails
        }
      }

      return extractedFiles
    },
    [extractTextFromPDF, extractTextFromDOCX]
  )

  return {
    extractTextFromPDF,
    extractTextFromDOCX,
    expandFiles,
    extractFileContentForStorage,
    getAttachedImagesForApi,
  }
}

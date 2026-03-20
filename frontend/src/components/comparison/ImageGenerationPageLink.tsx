/**
 * Link to /image-generation; closes the parent modal when clicked.
 */

import React from 'react'
import { Link } from 'react-router-dom'

interface ImageGenerationPageLinkProps {
  onNavigate?: () => void
}

export const ImageGenerationPageLink: React.FC<ImageGenerationPageLinkProps> = ({ onNavigate }) => (
  <p className="disabled-model-info-learn-more">
    <Link
      to="/image-generation"
      className="disabled-model-info-page-link"
      onClick={() => onNavigate?.()}
    >
      More about image generation and settings
    </Link>
  </p>
)

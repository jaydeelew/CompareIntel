/**
 * ProviderCarousel - 3D-look rotating carousel of AI provider icons
 *
 * Shown over the CompareIntel watermark when capability cards are hidden.
 * Items orbit a central point with simulated depth: front items grow large,
 * back items shrink and fade. Uses 2D transforms (translate + scale) for
 * reliable pointer hit-testing — CSS preserve-3d makes buttons un-clickable
 * in many browsers.
 *
 * Supports mouse drag (desktop) and touch swipe.
 * Click navigates to the provider's model dropdown; hover shows the name.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import '../../styles/providerCarousel.css'

/* ──────────────────────────────── types ──────────────────────────────── */

interface ProviderCarouselProps {
  providers: string[]
  onProviderClick: (provider: string) => void
}

/* ──────────────────────────────── brand colors ──────────────────────────────── */

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: '#10a37f',
  Anthropic: '#d4a373',
  Google: '#4285f4',
  Meta: '#0668e1',
  Microsoft: '#00a4ef',
  Mistral: '#ff7000',
  xAI: '#a0a0a0',
  DeepSeek: '#4d6bfe',
  Cohere: '#39594d',
  Qwen: '#612fff',
  'Black Forest Labs': '#a78bfa',
  'ByteDance Seed': '#fe2c55',
  Minimax: '#3b82f6',
  'Moonshot AI': '#8b5cf6',
  Xiaomi: '#ff6900',
  ArceeAi: '#2563eb',
  Sourceful: '#10b981',
  Stepfun: '#8b5cf6',
  ZAi: '#6366f1',
  Kwaipilot: '#f59e0b',
}

/* ──────────────────────────────── icon SVGs ──────────────────────────────── */

const PROVIDER_ABBR: Record<string, string> = {
  OpenAI: 'Ai',
  Anthropic: 'An',
  Google: 'G',
  Meta: '∞',
  Microsoft: 'Ms',
  Mistral: 'Mi',
  xAI: 'xA',
  DeepSeek: 'DS',
  Cohere: 'Co',
  Qwen: 'Qw',
  'Black Forest Labs': 'BF',
  'ByteDance Seed': 'BD',
  Minimax: 'Mx',
  'Moonshot AI': '☽',
  Xiaomi: 'Xi',
  ArceeAi: 'Ar',
  Sourceful: 'Sf',
  Stepfun: 'St',
  ZAi: 'Z',
  Kwaipilot: 'Kw',
}

export function ProviderIcon({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] ?? '#64748b'
  const abbr = PROVIDER_ABBR[provider] ?? provider.slice(0, 2)

  switch (provider) {
    case 'OpenAI':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
            fill={color}
          />
        </svg>
      )
    case 'Google':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285f4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34a853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#fbbc05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#ea4335"
          />
        </svg>
      )
    case 'Meta':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M6.897 4c1.915 0 3.516.932 5.43 3.376l.282-.373c.19-.246.383-.484.58-.71l.313-.35C14.588 4.788 15.792 4 17.225 4c1.273 0 2.469.557 3.491 1.516l.218.213c1.73 1.765 2.917 4.71 3.053 8.026l.011.392.002.25c0 1.501-.28 2.759-.818 3.7l-.14.23-.108.153c-.301.42-.664.758-1.086 1.009l-.265.142-.087.04a3.493 3.493 0 01-.302.118 4.117 4.117 0 01-1.33.208c-.524 0-.996-.067-1.438-.215-.614-.204-1.163-.56-1.726-1.116l-.227-.235c-.753-.812-1.534-1.976-2.493-3.586l-1.43-2.41-.544-.895-1.766 3.13-.343.592C7.597 19.156 6.227 20 4.356 20c-1.21 0-2.205-.42-2.936-1.182l-.168-.184c-.484-.573-.837-1.311-1.043-2.189l-.067-.32a8.69 8.69 0 01-.136-1.288L0 14.468c.002-.745.06-1.49.174-2.23l.1-.573c.298-1.53.828-2.958 1.536-4.157l.209-.34c1.177-1.83 2.789-3.053 4.615-3.16L6.897 4zm-.033 2.615l-.201.01c-.83.083-1.606.673-2.252 1.577l-.138.199-.01.018c-.67 1.017-1.185 2.378-1.456 3.845l-.004.022a12.591 12.591 0 00-.207 2.254l.002.188c.004.18.017.36.04.54l.043.291c.092.503.257.908.486 1.208l.117.137c.303.323.698.492 1.17.492 1.1 0 1.796-.676 3.696-3.641l2.175-3.4.454-.701-.139-.198C9.11 7.3 8.084 6.616 6.864 6.616zm10.196-.552l-.176.007c-.635.048-1.223.359-1.82.933l-.196.198c-.439.462-.887 1.064-1.367 1.807l.266.398c.18.274.362.56.55.858l.293.475 1.396 2.335.695 1.114c.583.926 1.03 1.6 1.408 2.082l.213.262c.282.326.529.54.777.673l.102.05c.227.1.457.138.718.138.176.002.35-.023.518-.073.338-.104.61-.32.813-.637l.095-.163.077-.162c.194-.459.29-1.06.29-1.785l-.006-.449c-.08-2.871-.938-5.372-2.2-6.798l-.176-.189c-.67-.683-1.444-1.074-2.27-1.074z"
            fill={color}
          />
        </svg>
      )
    case 'Microsoft':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <rect x="1" y="1" width="10" height="10" fill="#f25022" rx="1" />
          <rect x="13" y="1" width="10" height="10" fill="#7fba00" rx="1" />
          <rect x="1" y="13" width="10" height="10" fill="#00a4ef" rx="1" />
          <rect x="13" y="13" width="10" height="10" fill="#ffb900" rx="1" />
        </svg>
      )
    case 'Anthropic':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"
            fill={color}
          />
        </svg>
      )
    case 'Mistral':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <rect x="3" y="2" width="4" height="4" fill={color} rx="0.5" />
          <rect x="17" y="2" width="4" height="4" fill={color} rx="0.5" />
          <rect x="3" y="7" width="4" height="4" fill={color} rx="0.5" />
          <rect x="10" y="7" width="4" height="4" fill="#ffb800" rx="0.5" />
          <rect x="17" y="7" width="4" height="4" fill={color} rx="0.5" />
          <rect x="3" y="12" width="4" height="4" fill={color} rx="0.5" />
          <rect x="10" y="12" width="4" height="4" fill="#ffb800" rx="0.5" />
          <rect x="17" y="12" width="4" height="4" fill={color} rx="0.5" />
          <rect x="3" y="17" width="4" height="4" fill={color} rx="0.5" />
          <rect x="17" y="17" width="4" height="4" fill={color} rx="0.5" />
        </svg>
      )
    case 'xAI':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z"
            fill={color}
          />
        </svg>
      )
    case 'DeepSeek':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"
            fill={color}
          />
        </svg>
      )
    case 'Cohere':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            clipRule="evenodd"
            d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z"
            fill={color}
          />
          <path
            clipRule="evenodd"
            d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z"
            fill="#D18EE2"
          />
          <path
            d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z"
            fill="#FF7759"
          />
        </svg>
      )
    case 'Qwen':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"
            fill={color}
          />
        </svg>
      )
    case 'Black Forest Labs':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M17.113 10.248H14.56l-2.553-3.616-7.963 11.27h2.558l5.405-7.654h2.552l-5.404 7.653h2.565l5.392-7.653L24 20 19.97 20v-2.091l-2.857-4.044-2.842 4.037V20H0L12.008 3l5.105 7.249z"
            fill={color}
          />
        </svg>
      )
    case 'ByteDance Seed':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M14.944 18.587l-1.704-.445V10.01l1.824-.462c1-.254 1.84-.461 1.88-.453.032 0 .056 2.235.056 4.972v4.973l-.176-.008c-.104 0-.952-.207-1.88-.446z"
            fill={color}
          />
          <path
            d="M7 16.542c0-2.736.024-4.98.064-4.98.032-.008.872.2 1.88.454l1.816.461-.016 4.05-.024 4.049-1.632.422c-.896.23-1.736.445-1.856.469L7 21.523v-4.98z"
            fill={color}
          />
          <path
            d="M19.24 12.477c0-9.03.008-9.515.144-9.475.072.024.784.207 1.576.406.792.207 1.576.405 1.744.445l.296.08-.016 8.56-.024 8.568-1.624.414c-.888.23-1.728.437-1.856.47l-.24.055v-9.523z"
            fill={color}
          />
          <path
            d="M1 12.509c0-4.678.024-8.505.064-8.505.032 0 .872.207 1.872.454l1.824.461v7.582c0 4.16-.016 7.574-.032 7.574-.024 0-.872.215-1.88.47L1 21.013v-8.505z"
            fill={color}
          />
        </svg>
      )
    case 'Minimax':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z"
            fill={color}
          />
        </svg>
      )
    case 'Moonshot AI':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M1.052 16.916l9.539 2.552a21.007 21.007 0 00.06 2.033l5.956 1.593a11.997 11.997 0 01-5.586.865l-.18-.016-.044-.004-.084-.009-.094-.01a11.605 11.605 0 01-.157-.02l-.107-.014-.11-.016a11.962 11.962 0 01-.32-.051l-.042-.008-.075-.013-.107-.02-.07-.015-.093-.019-.075-.016-.095-.02-.097-.023-.094-.022-.068-.017-.088-.022-.09-.024-.095-.025-.082-.023-.109-.03-.062-.02-.084-.025-.093-.028-.105-.034-.058-.019-.08-.026-.09-.031-.066-.024a6.293 6.293 0 01-.044-.015l-.068-.025-.101-.037-.057-.022-.08-.03-.087-.035-.088-.035-.079-.032-.095-.04-.063-.028-.063-.027a5.655 5.655 0 01-.041-.018l-.066-.03-.103-.047-.052-.024-.096-.046-.062-.03-.084-.04-.086-.044-.093-.047-.052-.027-.103-.055-.057-.03-.058-.032a6.49 6.49 0 01-.046-.026l-.094-.053-.06-.034-.051-.03-.072-.041-.082-.05-.093-.056-.052-.032-.084-.053-.061-.039-.079-.05-.07-.047-.053-.035a7.785 7.785 0 01-.054-.036l-.044-.03-.044-.03a6.066 6.066 0 01-.04-.028l-.057-.04-.076-.054-.069-.05-.074-.054-.056-.042-.076-.057-.076-.059-.086-.067-.045-.035-.064-.052-.074-.06-.089-.073-.046-.039-.046-.039a7.516 7.516 0 01-.043-.037l-.045-.04-.061-.053-.07-.062-.068-.06-.062-.058-.067-.062-.053-.05-.088-.084a13.28 13.28 0 01-.099-.097l-.029-.028-.041-.042-.069-.07-.05-.051-.05-.053a6.457 6.457 0 01-.168-.179l-.08-.088-.062-.07-.071-.08-.042-.049-.053-.062-.058-.068-.046-.056a7.175 7.175 0 01-.027-.033l-.045-.055-.066-.082-.041-.052-.05-.064-.02-.025a11.99 11.99 0 01-1.44-2.402zm-1.02-5.794l11.353 3.037a20.468 20.468 0 00-.469 2.011l10.817 2.894a12.076 12.076 0 01-1.845 2.005L.657 15.923l-.016-.046-.035-.104a11.965 11.965 0 01-.05-.153l-.007-.023a11.896 11.896 0 01-.207-.741l-.03-.126-.018-.08-.021-.097-.018-.081-.018-.09-.017-.084-.018-.094c-.026-.141-.05-.283-.071-.426l-.017-.118-.011-.083-.013-.102a12.01 12.01 0 01-.019-.161l-.005-.047a12.12 12.12 0 01-.034-2.145zm1.593-5.15l11.948 3.196c-.368.605-.705 1.231-1.01 1.875l11.295 3.022c-.142.82-.368 1.612-.668 2.365l-11.55-3.09L.124 10.26l.015-.1.008-.049.01-.067.015-.087.018-.098c.026-.148.056-.295.088-.442l.028-.124.02-.085.024-.097c.022-.09.045-.18.07-.268l.028-.102.023-.083.03-.1.025-.082.03-.096.026-.082.031-.095a11.896 11.896 0 011.01-2.232zm4.442-4.4L17.352 4.59a20.77 20.77 0 00-1.688 1.721l7.823 2.093c.267.852.442 1.744.513 2.665L2.106 5.213l.045-.065.027-.04.04-.055.046-.065.055-.076.054-.072.064-.086.05-.065.057-.073.055-.07.06-.074.055-.069.065-.077.054-.066.066-.077.053-.06.072-.082.053-.06.067-.074.054-.058.073-.078.058-.06.063-.067.168-.17.1-.098.059-.056.076-.071a12.084 12.084 0 012.272-1.677zM12.017 0h.097l.082.001.069.001.054.002.068.002.046.001.076.003.047.002.06.003.054.002.087.005.105.007.144.011.088.007.044.004.077.008.082.008.047.005.102.012.05.006.108.014.081.01.042.006.065.01.207.032.07.012.065.011.14.026.092.018.11.022.046.01.075.016.041.01L14.7.3l.042.01.065.015.049.012.071.017.096.024.112.03.113.03.113.032.05.015.07.02.078.024.073.023.05.016.05.016.076.025.099.033.102.036.048.017.064.023.093.034.11.041.116.045.1.04.047.02.06.024.041.018.063.026.04.018.057.025.11.048.1.046.074.035.075.036.06.028.092.046.091.045.102.052.053.028.049.026.046.024.06.033.041.022.052.029.088.05.106.06.087.051.057.034.053.032.096.059.088.055.098.062.036.024.064.041.084.056.04.027.062.042.062.043.023.017c.054.037.108.075.161.114l.083.06.065.048.056.043.086.065.082.064.04.03.05.041.086.069.079.065.085.071c.712.6 1.353 1.283 1.909 2.031L7.222.994l.062-.027.065-.028.081-.034.086-.035c.113-.045.227-.09.341-.131l.096-.035.093-.033.084-.03.096-.031c.087-.03.176-.058.264-.085l.091-.027.086-.025.102-.03.085-.023.1-.026L9.04.37l.09-.023.091-.022.095-.022.09-.02.098-.021.091-.02.095-.018.092-.018.1-.018.091-.016.098-.017.092-.014.097-.015.092-.013.102-.013.091-.012.105-.012.09-.01.105-.01c.093-.01.186-.018.28-.024l.106-.008.09-.005.11-.006.093-.004.1-.004.097-.002.099-.002.197-.002z"
            fill={color}
          />
        </svg>
      )
    case 'Xiaomi':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M2 2h20a1 1 0 011 1v18a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z"
            fill={color}
            rx="3"
          />
          <path
            d="M13.74 17.5h-1.82a.14.14 0 01-.14-.14V9.33a.14.14 0 01.14-.14h1.82a.14.14 0 01.14.14v8.03a.14.14 0 01-.14.14zm-3.6 0H3.32a.14.14 0 01-.14-.14V9.33a.14.14 0 01.14-.14h1.82a.14.14 0 01.14.14v6.48a.14.14 0 00.14.14h3.92c1.1 0 1.42-.84 1.42-1.39V9.33a.14.14 0 01.14-.14h1.82a.14.14 0 01.14.14v5.89c0 .486-.058 1.184-.685 1.798-.656.642-1.253.752-1.925.752z"
            fill="#fff"
          />
          <path
            d="M8.87 14.2H6.96a.14.14 0 01-.14-.14V9.07a.14.14 0 01.14-.14h1.91a.14.14 0 01.14.14v4.99a.14.14 0 01-.14.14z"
            fill="#fff"
          />
        </svg>
      )
    case 'ArceeAi':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M13.236 2.377L2.751 20.493H0L11.863 0l1.373 2.377zm3.554 6.156l-9.606 11.96H4.13L15.511 6.32l1.279 2.212zm6.908 11.96H14.05l8.406-2.151 1.242 2.15zm-3.42-5.922l-7.843 5.92H8.482l10.597-7.997 1.2 2.077z"
            fill={color}
          />
        </svg>
      )
    case 'Stepfun':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M22.012 0h1.032v.927H24v.968h-.956V3.78h-1.032V1.896h-1.878v-.97h1.878V0zM2.6 12.371V1.87h.969v10.502h-.97zm10.423.66h10.95v.918h-6.208v9.579h-4.742V13.03zM5.629 3.333v12.356H0v4.51h10.386V8L20.859 8l-.003-4.668-15.227.001z"
            fill={color}
          />
        </svg>
      )
    case 'ZAi':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M9.671 5.365a1.697 1.697 0 011.099 2.132l-.071.172-.016.04-.018.054c-.07.16-.104.32-.104.498-.035.71.47 1.279 1.186 1.314h.366c1.309.053 2.338 1.173 2.286 2.523-.052 1.332-1.152 2.38-2.478 2.327h-.174c-.715.018-1.274.64-1.239 1.368 0 .124.018.23.053.337.209.373.54.658.96.8.75.23 1.517-.125 1.9-.782l.018-.035c.402-.64 1.17-.96 1.92-.711.854.284 1.378 1.226 1.099 2.167a1.661 1.661 0 01-2.077 1.102 1.711 1.711 0 01-.907-.711l-.017-.035c-.2-.323-.463-.58-.851-.711l-.056-.018a1.646 1.646 0 00-1.954.746 1.66 1.66 0 01-1.065.764 1.677 1.677 0 01-1.989-1.279c-.209-.906.332-1.83 1.257-2.043a1.51 1.51 0 01.296-.035h.018c.68-.071 1.151-.622 1.116-1.333a1.307 1.307 0 00-.227-.693 2.515 2.515 0 01-.366-1.403 2.39 2.39 0 01.366-1.208c.14-.195.21-.444.227-.693.018-.71-.506-1.261-1.186-1.332l-.07-.018a1.43 1.43 0 01-.299-.07l-.05-.019a1.7 1.7 0 01-1.047-2.114 1.68 1.68 0 012.094-1.101zm-5.575 10.11c.26-.264.639-.367.994-.27.355.096.633.379.728.74.095.362-.007.748-.267 1.013-.402.41-1.053.41-1.455 0a1.062 1.062 0 010-1.482zm14.845-.294c.359-.09.738.024.992.297.254.274.344.665.237 1.025-.107.36-.396.634-.756.718-.551.128-1.1-.22-1.23-.781a1.05 1.05 0 01.757-1.26zm-.064-4.39c.314.32.49.753.49 1.206 0 .452-.176.886-.49 1.206-.315.32-.74.5-1.185.5-.444 0-.87-.18-1.184-.5a1.727 1.727 0 010-2.412 1.654 1.654 0 012.369 0zm-11.243.163c.364.484.447 1.128.218 1.691a1.665 1.665 0 01-2.188.923c-.855-.36-1.26-1.358-.907-2.228a1.68 1.68 0 011.33-1.038c.593-.08 1.183.169 1.547.652zm11.545-4.221c.368 0 .708.2.892.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.892.524c-.568 0-1.03-.47-1.03-1.048 0-.579.462-1.048 1.03-1.048zm-14.358 0c.368 0 .707.2.891.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.891.524c-.569 0-1.03-.47-1.03-1.048 0-.579.461-1.048 1.03-1.048zm10.031-1.475c.925 0 1.675.764 1.675 1.706s-.75 1.705-1.675 1.705-1.674-.763-1.674-1.705c0-.942.75-1.706 1.674-1.706z"
            fill={color}
          />
        </svg>
      )
    case 'Kwaipilot':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            clipRule="evenodd"
            d="M11.765.03C5.327.03.108 5.25.108 11.686c0 3.514 1.556 6.665 4.015 8.804L9.89 8.665h6.451L9.31 23.083c.807.173 1.63.26 2.455.26 6.438 0 11.657-5.22 11.657-11.658S18.202.028 11.765.028V.03z"
            fill={color}
          />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 40 40" className="provider-carousel-svg" aria-hidden>
          <circle cx="20" cy="20" r="18" fill={color} opacity="0.15" />
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            opacity="0.4"
          />
          <text
            x="20"
            y="21"
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="600"
            fontSize={abbr.length > 2 ? '10' : '12'}
          >
            {abbr}
          </text>
        </svg>
      )
  }
}

/* ──────────────────────────────── layout math ──────────────────────────────── */

const AUTO_ROTATE_SPEED = 0.15
const DRAG_SENSITIVITY = 0.4
const MOMENTUM_DECAY = 0.94
const MOMENTUM_MIN = 0.05
const DEPTH_THRESHOLD = 0.5
const OCCLUDE_DEPTH = 0.2

interface LayoutParams {
  radius: number
  tiltY: number
  scaleFront: number
  scaleBack: number
}

const LAYOUT_DESKTOP: LayoutParams = { radius: 280, tiltY: 32, scaleFront: 2.0, scaleBack: 0.2 }
const LAYOUT_TABLET: LayoutParams = { radius: 200, tiltY: 24, scaleFront: 1.6, scaleBack: 0.2 }
const LAYOUT_MOBILE: LayoutParams = { radius: 180, tiltY: 18, scaleFront: 2.0, scaleBack: 0.1 }

function useResponsiveLayout(): LayoutParams {
  const [params, setParams] = useState<LayoutParams>(LAYOUT_DESKTOP)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 480px)')
    const tablet = window.matchMedia('(max-width: 1100px)')

    const update = () => {
      if (mobile.matches) setParams(LAYOUT_MOBILE)
      else if (tablet.matches) setParams(LAYOUT_TABLET)
      else setParams(LAYOUT_DESKTOP)
    }

    update()
    mobile.addEventListener('change', update)
    tablet.addEventListener('change', update)
    return () => {
      mobile.removeEventListener('change', update)
      tablet.removeEventListener('change', update)
    }
  }, [])

  return params
}

/**
 * Compute 2D x, y, scale, opacity, zIndex, isFront for one carousel item.
 * The ring is tilted forward so the front dips below center and
 * the back rises above. Items are split into a front layer (above the
 * watermark) and a back layer (behind it) so they appear to orbit
 * around the floating logo — fully hidden when directly behind it,
 * smoothly emerging at the edges.
 */
function itemLayout(
  itemAngleDeg: number,
  rotationDeg: number,
  { radius, tiltY, scaleFront, scaleBack }: LayoutParams
) {
  const theta = ((itemAngleDeg + rotationDeg) % 360) * (Math.PI / 180)
  const x = Math.sin(theta) * radius
  const z = Math.cos(theta) * radius

  const depth = (z + radius) / (2 * radius)

  const y = (z / radius) * tiltY
  const scale = scaleBack + (scaleFront - scaleBack) * depth

  const opacity =
    depth <= OCCLUDE_DEPTH ? 0 : Math.pow((depth - OCCLUDE_DEPTH) / (1 - OCCLUDE_DEPTH), 0.4)

  const zIndex = Math.round(z + radius)
  const isFront = depth > DEPTH_THRESHOLD
  return { x, y, scale, opacity, zIndex, isFront }
}

/* ──────────────────────────────── component ──────────────────────────────── */

export function ProviderCarousel({ providers, onProviderClick }: ProviderCarouselProps) {
  const layoutParams = useResponsiveLayout()
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [tooltipProvider, setTooltipProvider] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const sceneRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const rotRef = useRef(0)
  const draggingRef = useRef(false)
  const hoveredRef = useRef(false)
  const velRef = useRef(0)
  const startXRef = useRef(0)
  const startRotRef = useRef(0)
  const lastXRef = useRef(0)
  const lastTimeRef = useRef(0)
  const didDragRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const [touchTooltip, setTouchTooltip] = useState<{
    provider: string
    x: number
    y: number
  } | null>(null)

  const count = providers.length
  const angleStep = 360 / count
  const baseAngles = useMemo(() => providers.map((_, i) => i * angleStep), [providers, angleStep])

  // Sync ref
  useEffect(() => {
    rotRef.current = rotation
  }, [rotation])

  // Auto-rotate + momentum loop
  useEffect(() => {
    let live = true
    const tick = () => {
      if (!live) return
      if (!draggingRef.current) {
        if (Math.abs(velRef.current) > MOMENTUM_MIN) {
          rotRef.current += velRef.current
          velRef.current *= MOMENTUM_DECAY
          setRotation(rotRef.current)
        } else if (!hoveredRef.current) {
          velRef.current = 0
          rotRef.current += AUTO_ROTATE_SPEED
          setRotation(rotRef.current)
        }
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  // --- Pointer drag via native document listeners ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const dx = e.clientX - startXRef.current
      if (Math.abs(dx) > 3) {
        didDragRef.current = true
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }
      const now = performance.now()
      const dt = now - lastTimeRef.current
      if (dt > 0) velRef.current = ((e.clientX - lastXRef.current) / dt) * 10
      lastXRef.current = e.clientX
      lastTimeRef.current = now
      rotRef.current = startRotRef.current + dx * DRAG_SENSITIVITY
      setRotation(rotRef.current)
    }
    const onUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      setTouchTooltip(null)
      if (!draggingRef.current) return
      draggingRef.current = false
      setIsDragging(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    }
  }, [])

  const onScenePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    didDragRef.current = false
    velRef.current = 0
    startXRef.current = e.clientX
    startRotRef.current = rotRef.current
    lastXRef.current = e.clientX
    lastTimeRef.current = performance.now()
  }, [])

  // --- Item handlers ---
  const onItemPointerDown = useCallback((provider: string, e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    longPressFiredRef.current = false
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    const x = e.clientX
    const y = e.clientY
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimerRef.current = null
      setTouchTooltip({ provider, x, y })
      if (navigator.vibrate) navigator.vibrate(10)
    }, 500)
  }, [])

  const onItemClick = useCallback(
    (provider: string, e: React.MouseEvent) => {
      if (didDragRef.current || longPressFiredRef.current) {
        e.preventDefault()
        e.stopPropagation()
        longPressFiredRef.current = false
        return
      }
      onProviderClick(provider)
    },
    [onProviderClick]
  )

  const onItemEnter = useCallback((provider: string, e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    hoveredRef.current = true
    setTooltipProvider(provider)
  }, [])

  const onItemPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  const onItemLeave = useCallback(() => {
    hoveredRef.current = false
    setTooltipProvider(null)
    setTooltipPos(null)
  }, [])

  const layouts = providers.map((_, i) => itemLayout(baseAngles[i], rotation, layoutParams))

  const renderItem = (provider: string, i: number, interactive: boolean) => {
    const { x, y, scale, opacity, zIndex } = layouts[i]
    return (
      <button
        key={provider}
        type="button"
        className="provider-carousel-item"
        style={{
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          opacity,
          zIndex,
        }}
        onClick={interactive ? e => onItemClick(provider, e) : undefined}
        onPointerDown={interactive ? e => onItemPointerDown(provider, e) : undefined}
        onPointerEnter={interactive ? e => onItemEnter(provider, e) : undefined}
        onPointerMove={interactive ? onItemPointerMove : undefined}
        onPointerLeave={interactive ? onItemLeave : undefined}
        onContextMenu={interactive ? e => e.preventDefault() : undefined}
        aria-label={`View ${provider} models`}
        tabIndex={interactive ? 0 : -1}
      >
        <span className="provider-carousel-item-inner">
          <ProviderIcon provider={provider} />
        </span>
      </button>
    )
  }

  return (
    <>
      {/* Back layer — behind the watermark logo */}
      <div className="provider-carousel-wrapper provider-carousel-back" aria-hidden="true">
        <div className="provider-carousel-scene">
          {providers.map((provider, i) =>
            layouts[i].isFront ? null : renderItem(provider, i, false)
          )}
        </div>
      </div>

      {/* Front layer — in front of the watermark logo */}
      <div
        className="provider-carousel-wrapper provider-carousel-front"
        aria-label="AI model providers"
      >
        <div
          ref={sceneRef}
          className={`provider-carousel-scene${isDragging ? ' provider-carousel-scene--dragging' : ''}`}
          onPointerDown={onScenePointerDown}
        >
          {providers.map((provider, i) =>
            layouts[i].isFront ? renderItem(provider, i, true) : null
          )}
        </div>
      </div>

      {tooltipProvider &&
        tooltipPos &&
        createPortal(
          <div
            className="provider-carousel-tooltip"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            {tooltipProvider}
          </div>,
          document.body
        )}

      {touchTooltip &&
        createPortal(
          <div
            className="provider-carousel-touch-tooltip"
            style={{ left: touchTooltip.x, top: touchTooltip.y }}
          >
            {touchTooltip.provider}
          </div>,
          document.body
        )}
    </>
  )
}

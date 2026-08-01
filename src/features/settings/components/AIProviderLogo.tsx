import { Sparkles } from '@gravity-ui/icons';

type AIProviderLogoProps = {
  providerId?: string;
  alt: string;
  className?: string;
  size?: number;
};

const PROVIDER_ID_ALIASES: Record<string, string> = {
  google: 'gemini',
  'alibaba-cn': 'qwen',
  'moonshotai-cn': 'kimi',
  siliconflow: 'siliconcloud',
  'siliconflow-cn': 'siliconcloud',
  'tencent-tokenhub': 'tencent',
  xiaomi: 'xiaomimimo',
};

/** Monochrome provider mark sourced from the same models.dev catalog as CipherTalk. */
export default function AIProviderLogo({
  providerId,
  alt,
  className = '',
  size = 24,
}: AIProviderLogoProps) {
  const normalized = providerId ? (PROVIDER_ID_ALIASES[providerId] ?? providerId) : '';
  const classes = ['cipher-ai-provider-logo', className].filter(Boolean).join(' ');

  if (!normalized || normalized === 'custom' || normalized === 'openai-compatible') {
    return <Sparkles aria-label={alt} className={classes} height={size} role="img" width={size} />;
  }

  const logoUrl = `https://models.dev/logos/${encodeURIComponent(normalized)}.svg`;
  return (
    <span
      aria-label={alt}
      className={classes}
      data-provider-id={normalized}
      role="img"
      style={{
        backgroundColor: 'currentColor',
        display: 'inline-block',
        height: size,
        mask: `url("${logoUrl}") center / contain no-repeat`,
        WebkitMask: `url("${logoUrl}") center / contain no-repeat`,
        width: size,
      }}
    />
  );
}

import { inlineEmphasis } from '../../lib/inline-emphasis';
export function renderEmphasis(text: string) {
  return inlineEmphasis(text).map((part, index) => part.kind === 'strong' ? <strong key={index}>{part.text}</strong>
    : part.kind === 'em' ? <em key={index}>{part.text}</em> : part.text);
}

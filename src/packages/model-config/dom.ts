// #ModelConfig — plain-DOM provider accordion: Google / OpenAI / Anthropic
// cards, each with a masked key input + eye toggle, two read-only default-model
// rows, and a Get-API-key deep link; optional BYOK and change-models help links.
// Props in, callbacks out; the only internal state is the per-provider reveal
// toggle. Styling comes from --mc-* custom properties with light defaults.
import type { ModelDef, Provider } from './index';

export interface ModelChooserProps {
  models: readonly ModelDef[];
  provider: Provider;
  keys: Record<Provider, string>;
  primaryModel: string;
  secondaryModel: string;
  expandedProvider: Provider | null;
  byokHelpUrl?: string;
  changeModelsHelpUrl?: string;
  onProviderClick: (p: Provider) => void;
  onKeyChange: (p: Provider, value: string) => void;
}

const CARDS: { provider: Provider; label: string; tagline: string; keyUrl: string; placeholder: string }[] = [
  { provider: 'gemini', label: 'Google', tagline: 'Gemini models', keyUrl: 'https://aistudio.google.com/apikey', placeholder: 'AIza…' },
  { provider: 'openai', label: 'OpenAI', tagline: 'GPT models', keyUrl: 'https://platform.openai.com/api-keys', placeholder: 'sk-…' },
  { provider: 'anthropic', label: 'Anthropic', tagline: 'Claude models', keyUrl: 'https://console.anthropic.com/settings/keys', placeholder: 'sk-ant-…' },
];

const EYE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
  '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
  '<path d="M6.2 6.2A2 2 0 0 0 9.8 9.8 M3 3l10 10 M5.2 5.3C2.9 6.6 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.2 2.7-.6 M10.8 10.7C13 9.4 14.5 8 14.5 8S12 3.5 8 3.5"/></svg>';

function helpLink(attr: string, href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute(attr, '');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.textContent = text;
  a.style.cssText = 'display:block;margin:6px 0;color:var(--mc-accent,#4759B2);font-size:12.5px';
  return a;
}

function radioKnob(selected: boolean): HTMLElement {
  const knob = document.createElement('span');
  knob.setAttribute('aria-hidden', 'true');
  knob.style.cssText = 'flex:0 0 auto;width:14px;height:14px;border-radius:7px;' +
    `border:1.5px solid var(--mc-${selected ? 'accent,#96BED7' : 'line2,#c9c9c9'});` +
    (selected
      ? 'background:var(--mc-accent,#96BED7);box-shadow:inset 0 0 0 2.5px var(--mc-surface,#fff)'
      : 'background:transparent');
  return knob;
}

function modelRow(role: 'primary' | 'secondary', id: string, models: readonly ModelDef[]): HTMLElement {
  const def = models.find((m) => m.id === id);
  const row = document.createElement('div');
  row.setAttribute('data-mc-model', id);
  row.setAttribute('data-mc-role', role);
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:4px' +
    (role === 'primary' ? ';background:var(--mc-accent-soft,#e3edf5)' : '');
  const label = document.createElement('span');
  label.textContent = `${role === 'primary' ? 'Primary' : 'Secondary'}: ${id}`;
  label.style.cssText = 'flex:1;font-family:var(--mc-font-mono,monospace);font-size:12.5px';
  row.appendChild(label);
  if (def?.voiceInput) {
    const tag = document.createElement('span');
    tag.textContent = '🎙 voice';
    tag.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:1px 6px;' +
      'border-radius:10px;font-size:11.5px;color:var(--mc-ok,#2E7D32);' +
      'background:var(--mc-ok-soft,#E8F5E9);flex-shrink:0';
    row.appendChild(tag);
  }
  return row;
}

/** Renders the provider accordion into `container`, replacing previous content. */
export function mountModelChooser(container: HTMLElement, p: ModelChooserProps): void {
  const holder = container as HTMLElement & {
    __mcProps?: ModelChooserProps;
    __mcReveal?: Partial<Record<Provider, boolean>>;
  };
  holder.__mcProps = p;
  holder.__mcReveal ??= {};
  container.innerHTML = '';
  container.style.cssText = 'font-family:var(--mc-font-ui,system-ui,sans-serif);' +
    'color:var(--mc-ink,#281C60);max-width:480px';

  const intro = document.createElement('p');
  intro.textContent = 'Pick a provider. The Primary model answers chat turns; the Secondary model fills table cells.';
  intro.style.cssText = 'margin:0 0 8px;color:var(--mc-ink3,#6d6491);font-size:11.5px;line-height:1.45';
  container.appendChild(intro);
  if (p.byokHelpUrl) container.appendChild(helpLink('data-mc-byok', p.byokHelpUrl, 'New here? How to get an API key ↗'));

  for (const card of CARDS) {
    const isSelected = p.provider === card.provider;
    const isExpanded = p.expandedProvider === card.provider;
    const box = document.createElement('section');
    box.setAttribute('data-mc-card', card.provider);
    box.style.cssText = `border:1px solid var(--mc-${isExpanded ? 'accent,#96BED7' : 'line,#DCDCDC'});` +
      'border-radius:10px;margin:8px 0;overflow:hidden;background:var(--mc-surface,#FFF)';

    const head = document.createElement('button');
    head.setAttribute('data-mc-head', '');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'padding:10px 12px;border:0;cursor:pointer;background:transparent;color:inherit;font-family:inherit';
    head.appendChild(radioKnob(isSelected));
    const names = document.createElement('span');
    names.style.flex = '1';
    const name = document.createElement('span');
    name.textContent = card.label + (isSelected ? ' ✓' : '');
    name.style.cssText = 'display:block;font-size:14px;font-weight:600';
    const tagline = document.createElement('span');
    tagline.textContent = card.tagline;
    tagline.style.cssText = 'font-size:11.5px;color:var(--mc-ink3,#6d6491)';
    names.append(name, tagline);
    head.appendChild(names);
    const hasVoice = p.models.some((m) => m.provider === card.provider && m.voiceInput);
    const badge = document.createElement('span');
    badge.textContent = hasVoice ? '🎙 Voice input' : 'No voice input';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:2px 7px;' +
      'border-radius:12px;font-size:11.5px;font-weight:500;flex-shrink:0;' +
      (hasVoice ? 'background:var(--mc-ok-soft,#E8F5E9);color:var(--mc-ok,#2E7D32)'
        : 'background:var(--mc-surface3,#F3F3F3);color:var(--mc-ink3,#6d6491)');
    head.appendChild(badge);
    head.addEventListener('click', () => holder.__mcProps!.onProviderClick(card.provider));
    box.appendChild(head);

    if (isExpanded) {
      const body = document.createElement('div');
      body.style.cssText = 'padding:8px 14px 12px;border-top:1px solid var(--mc-line,#DCDCDC)';

      const keyRow = document.createElement('div');
      keyRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;' +
        'border:1px solid var(--mc-line2,#c9c9c9);border-radius:6px;padding:6px 8px;' +
        'background:var(--mc-surface2,#FAFAFA)';
      const input = document.createElement('input');
      input.setAttribute('data-mc-key', card.provider);
      input.type = holder.__mcReveal[card.provider] ? 'text' : 'password';
      input.placeholder = card.placeholder;
      input.value = p.keys[card.provider] ?? '';
      input.style.cssText = 'flex:1;border:none;outline:none;background:transparent;' +
        'font-family:var(--mc-font-mono,monospace);font-size:12.5px;color:var(--mc-ink,#281C60)';
      input.addEventListener('input', () => holder.__mcProps!.onKeyChange(card.provider, input.value));
      keyRow.appendChild(input);
      const reveal = document.createElement('button');
      reveal.setAttribute('data-mc-reveal', card.provider);
      reveal.type = 'button';
      reveal.title = holder.__mcReveal[card.provider] ? 'Hide key' : 'Show key';
      reveal.innerHTML = holder.__mcReveal[card.provider] ? EYE_OFF_SVG : EYE_SVG;
      reveal.style.cssText = 'cursor:pointer;border:0;padding:2px;background:transparent;' +
        'color:var(--mc-ink3,#6d6491);display:flex';
      reveal.addEventListener('click', () => {
        holder.__mcReveal![card.provider] = !holder.__mcReveal![card.provider];
        mountModelChooser(container, holder.__mcProps!);
      });
      keyRow.appendChild(reveal);
      body.appendChild(keyRow);

      const link = document.createElement('a');
      link.setAttribute('data-mc-keyurl', card.provider);
      link.href = card.keyUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Get API key ↗';
      link.style.cssText = 'display:block;margin:4px 0 8px;color:var(--mc-accent2,#4759B2);font-size:12.5px';
      body.appendChild(link);

      body.appendChild(modelRow('primary', p.primaryModel, p.models));
      body.appendChild(modelRow('secondary', p.secondaryModel, p.models));
      box.appendChild(body);
    }
    container.appendChild(box);
  }

  if (p.changeModelsHelpUrl) {
    container.appendChild(helpLink('data-mc-changemodels', p.changeModelsHelpUrl, 'How to change primary and secondary models? ↗'));
  }
}

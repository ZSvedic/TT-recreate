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

const CARDS: { provider: Provider; label: string; keyUrl: string }[] = [
  { provider: 'gemini', label: 'Google', keyUrl: 'https://aistudio.google.com/apikey' },
  { provider: 'openai', label: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys' },
  { provider: 'anthropic', label: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys' },
];

function helpLink(attr: string, href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute(attr, '');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.textContent = text;
  a.style.cssText = 'display:block;margin:6px 0;color:var(--mc-accent,#4759B2)';
  return a;
}

function modelRow(role: 'primary' | 'secondary', id: string, models: readonly ModelDef[]): HTMLElement {
  const def = models.find((m) => m.id === id);
  const row = document.createElement('div');
  row.setAttribute('data-mc-model', id);
  row.setAttribute('data-mc-role', role);
  row.style.cssText = 'display:flex;gap:8px;padding:2px 0;font-family:var(--mc-font-mono,monospace);font-size:13px';
  const label = document.createElement('span');
  label.textContent = `${role === 'primary' ? 'Primary' : 'Secondary'}: ${id}`;
  row.appendChild(label);
  if (def?.voiceInput) {
    const tag = document.createElement('span');
    tag.textContent = '🎙 voice';
    tag.style.cssText = 'color:var(--mc-ok,#2E7D32);background:var(--mc-ok-soft,#E8F5E9);border-radius:var(--mc-radius-sm,4px);padding:0 4px';
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
  container.style.cssText = 'font-family:var(--mc-font-ui,system-ui,sans-serif);color:var(--mc-ink,#281C60);max-width:480px';

  const intro = document.createElement('p');
  intro.textContent = 'Pick a provider. The Primary model answers chat turns; the Secondary model fills table cells.';
  intro.style.cssText = 'color:var(--mc-ink3,#666);font-size:13px';
  container.appendChild(intro);
  if (p.byokHelpUrl) container.appendChild(helpLink('data-mc-byok', p.byokHelpUrl, 'New here? How to get an API key ↗'));

  for (const card of CARDS) {
    const box = document.createElement('section');
    box.setAttribute('data-mc-card', card.provider);
    box.style.cssText = 'border:1px solid var(--mc-line,#DCDCDC);border-radius:var(--mc-radius,8px);margin:8px 0;background:var(--mc-surface,#FFF)';

    const head = document.createElement('button');
    head.setAttribute('data-mc-head', '');
    head.textContent = card.label + (p.provider === card.provider ? ' ✓' : '');
    head.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;border:0;cursor:pointer;font-size:15px;'
      + `background:${p.provider === card.provider ? 'var(--mc-accent-soft,#EEF1FB)' : 'var(--mc-surface2,#FAFAFA)'};`
      + 'border-radius:var(--mc-radius,8px);color:inherit';
    head.addEventListener('click', () => holder.__mcProps!.onProviderClick(card.provider));
    box.appendChild(head);

    if (p.expandedProvider === card.provider) {
      const body = document.createElement('div');
      body.style.cssText = 'padding:8px 12px;border-top:1px solid var(--mc-line2,#EEE)';

      const keyRow = document.createElement('div');
      keyRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
      const input = document.createElement('input');
      input.setAttribute('data-mc-key', card.provider);
      input.type = holder.__mcReveal[card.provider] ? 'text' : 'password';
      input.placeholder = 'API key';
      input.value = p.keys[card.provider] ?? '';
      input.style.cssText = 'flex:1;padding:4px 6px;border:1px solid var(--mc-line,#DCDCDC);border-radius:var(--mc-radius-sm,4px);font-family:var(--mc-font-mono,monospace)';
      input.addEventListener('input', () => holder.__mcProps!.onKeyChange(card.provider, input.value));
      keyRow.appendChild(input);
      const reveal = document.createElement('button');
      reveal.setAttribute('data-mc-reveal', card.provider);
      reveal.type = 'button';
      reveal.textContent = '👁';
      reveal.style.cssText = 'cursor:pointer;border:1px solid var(--mc-line,#DCDCDC);border-radius:var(--mc-radius-sm,4px);background:var(--mc-surface3,#F3F3F3)';
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
      link.style.cssText = 'display:block;margin:4px 0;color:var(--mc-accent,#4759B2);font-size:13px';
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

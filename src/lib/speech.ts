import { normalizeForSpeech } from './normalize';
import type { DocumentData, Pronunciation } from './types';

export interface SpeechSettings { voice?: SpeechSynthesisVoice; rate: number; pitch: number; skipReferences: boolean; skipNotes: boolean; skipCaptions: boolean; overrides: Record<string, Pronunciation>; definitions: Record<string, string>; }
export class SpeechReader {
  private generation = 0;
  private doc?: DocumentData;
  private settings?: SpeechSettings;
  private firstUse = new Set<string>();
  index = 0;
  paused = false;
  speaking = false;
  onPosition?: (index: number, word?: number) => void;
  onState?: () => void;

  load(doc: DocumentData, settings: SpeechSettings, index = 0) {
    this.stop(); this.doc = doc; this.settings = settings; this.index = Math.max(0, Math.min(index, doc.sentences.length - 1)); this.firstUse.clear(); this.onPosition?.(this.index);
  }
  update(settings: SpeechSettings) { this.settings = settings; }
  stop() { this.generation++; speechSynthesis.cancel(); this.speaking = false; this.paused = false; this.onState?.(); }
  pause() { if (this.speaking) { speechSynthesis.pause(); this.paused = true; this.onState?.(); } }
  resume() { if (this.paused) { speechSynthesis.resume(); this.paused = false; this.onState?.(); } else this.play(); }
  seek(index: number, play = true) {
    if (!this.doc) return;
    this.stop(); this.index = Math.max(0, Math.min(index, this.doc.sentences.length - 1)); this.onPosition?.(this.index);
    if (play) this.play();
  }
  moveSentence(delta: number) { this.seek(this.index + delta); }
  moveParagraph(delta: number) {
    if (!this.doc) return;
    const current = this.doc.sentences[this.index]?.paragraph || 0;
    let target = -1;
    if (delta > 0) target = this.doc.sentences.findIndex((s, i) => i > this.index && s.paragraph > current);
    else for (let i = this.index - 1; i >= 0; i--) if (this.doc.sentences[i].paragraph < current) { target = i; break; }
    if (target >= 0) this.seek(target);
  }
  play() {
    if (!this.doc || !this.settings || !('speechSynthesis' in window)) return;
    if (this.paused) { this.resume(); return; }
    this.stop(); this.speaking = true; this.onState?.();
    const generation = this.generation;
    const advance = () => {
      if (generation !== this.generation || !this.doc || !this.settings) return;
      let sentence = this.doc.sentences[this.index];
      let spoken = '';
      while (sentence) {
        if (!this.shouldSkip(sentence.text)) {
          spoken = normalizeForSpeech(sentence.text, { definitions: this.settings.definitions, overrides: this.settings.overrides, firstUse: this.firstUse });
          if (/[\p{L}\d]/u.test(spoken)) break;
        }
        this.index++;
        sentence = this.doc.sentences[this.index];
      }
      if (!sentence) { this.speaking = false; this.onState?.(); return; }
      this.onPosition?.(this.index);
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = 'pt-BR'; utterance.voice = this.settings.voice || null;
      utterance.rate = this.settings.rate; utterance.pitch = this.settings.pitch;
      utterance.onboundary = event => {
        if (generation !== this.generation) return;
        const preceding = utterance.text.slice(0, event.charIndex);
        this.onPosition?.(this.index, preceding.trim() ? preceding.trim().split(/\s+/).length : 0);
      };
      utterance.onend = () => { if (generation === this.generation) { this.index++; advance(); } };
      utterance.onerror = () => { if (generation === this.generation) { this.speaking = false; this.onState?.(); } };
      speechSynthesis.speak(utterance);
    };
    advance();
  }
  private shouldSkip(text: string) {
    const settings = this.settings!;
    const bibliographyStart = settings.skipReferences ? this.doc?.sentences.findIndex(s => /^\s*(referências(?: bibliográficas)?|bibliografia)\s*\.?$/i.test(s.text)) ?? -1 : -1;
    return (settings.skipReferences && ((bibliographyStart >= 0 && this.index >= bibliographyStart && !this.doc?.sentences.slice(bibliographyStart + 1, this.index + 1).some(s => /^\s*(apêndice|anexo)\b/i.test(s.text))) || /^\s*\[\d+\]/.test(text))) ||
      (settings.skipNotes && /^\s*(nota|rodapé|footnote)\s*\d*/i.test(text)) ||
      (settings.skipCaptions && /^\s*(figura|tabela|quadro)\s*\d+/i.test(text));
  }
}

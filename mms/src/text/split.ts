// Text - Split

import { doc, isBrowser } from '../core/consts';
import { scope } from '../core/globals';
import { isFnc, isNum, isStr, isObj, isUnd, isArr } from '../core/helpers';
import { getNodeList } from '../core/targets';
import { setValue } from '../core/values';
import { keepTime } from '../utils/time';
import type {
  Tickable,
  DOMTarget,
  SplitTemplateParams,
  SplitFunctionValue,
  TextSplitterParams,
} from '../types';

const segmenter = (typeof Intl !== 'undefined') && Intl.Segmenter;
const valueRgx = /\{value\}/g;
const indexRgx = /\{i\}/g;
const whiteSpaceGroupRgx = /(\s+)/;
const whiteSpaceRgx = /^\s+$/;
const lineType = 'line';
const wordType = 'word';
const charType = 'char';
const dataLine = `data-line`;

interface Segment {
  segment: string;
  isWordLike?: boolean;
}

interface Segmenter {
  segment(text: string): Iterable<Segment>;
}

let wordSegmenter: Segmenter | null = null;
let graphemeSegmenter: Segmenter | null = null;
let $splitTemplate: HTMLTemplateElement | null = null;

function isSegmentWordLike(seg: Segment): boolean {
  return seg.isWordLike ||
         seg.segment === ' ' ||
         isNum(+seg.segment);
}

function setAriaHidden($el: HTMLElement): void {
  $el.setAttribute('aria-hidden', 'true');
}

function getAllTopLevelElements($el: DOMTarget, type: string): HTMLElement[] {
  return [...($el as Element).querySelectorAll(`[data-${type}]:not([data-${type}] [data-${type}])`)] as HTMLElement[];
}

const debugColors = { line: '#00D672', word: '#FF4B4B', char: '#5A87FF' };

function filterEmptyElements($el: HTMLElement): void {
  if (!$el.childElementCount && !$el.textContent?.trim()) {
    const $parent = $el.parentElement;
    $el.remove();
    if ($parent) filterEmptyElements($parent);
  }
}

function filterLineElements($el: HTMLElement, lineIndex: number, bin: Set<HTMLElement | Node>): Set<HTMLElement | Node> {
  const dataLineAttr = $el.getAttribute(dataLine);
  if (dataLineAttr !== null && +dataLineAttr !== lineIndex || $el.tagName === 'BR') {
    bin.add($el);
    const prev = $el.previousSibling;
    const next = $el.nextSibling;
    if (prev && prev.nodeType === 3 && whiteSpaceRgx.test(prev.textContent || '')) {
      bin.add(prev);
    }
    if (next && next.nodeType === 3 && whiteSpaceRgx.test(next.textContent || '')) {
      bin.add(next);
    }
  }
  let i = $el.childElementCount;
  while (i--) filterLineElements($el.children[i] as HTMLElement, lineIndex, bin);
  return bin;
}

function generateTemplate(type: 'line' | 'word' | 'char', params: SplitTemplateParams = {}): string {
  let template = ``;
  const classString = isStr(params.class) ? ` class="${params.class}"` : '';
  const cloneType = setValue(params.clone, false);
  const wrapType = setValue(params.wrap, false);
  const overflow = wrapType ? wrapType === true ? 'clip' : wrapType : cloneType ? 'clip' : false;
  if (wrapType) template += `<span${overflow ? ` style="overflow:${overflow};"` : ''}>`;
  template += `<span${classString}${cloneType ? ` style="position:relative;"` : ''} data-${type}="{i}">`;
  if (cloneType) {
    const left = cloneType === 'left' ? '-100%' : cloneType === 'right' ? '100%' : '0';
    const top = cloneType === 'top' ? '-100%' : cloneType === 'bottom' ? '100%' : '0';
    template += `<span>{value}</span>`;
    template += `<span inert style="position:absolute;top:${top};left:${left};white-space:nowrap;">{value}</span>`;
  } else {
    template += `{value}`;
  }
  template += `</span>`;
  if (wrapType) template += `</span>`;
  return template;
}

function processHTMLTemplate(
  htmlTemplate: string | SplitFunctionValue,
  store: HTMLElement[],
  node: Node | HTMLElement,
  $parentFragment: DocumentFragment,
  type: 'line' | 'word' | 'char',
  debug: boolean,
  lineIndex: number,
  wordIndex?: number,
  charIndex?: number
): HTMLElement {
  const isLine = type === lineType;
  const isChar = type === charType;
  const className = `_${type}_`;
  const template = isFnc(htmlTemplate) ? (htmlTemplate as SplitFunctionValue)(node) : htmlTemplate;
  const displayStyle = isLine ? 'block' : 'inline-block';
  $splitTemplate!.innerHTML = (template as string)
    .replace(valueRgx, `<i class="${className}"></i>`)
    .replace(indexRgx, `${isChar ? charIndex : isLine ? lineIndex : wordIndex}`);
  const $content = $splitTemplate!.content;
  const $highestParent = $content.firstElementChild as HTMLElement;
  const $split = ($content.querySelector(`[data-${type}]`) as HTMLElement) || $highestParent;
  const $replacables = $content.querySelectorAll(`i.${className}`) as NodeListOf<HTMLElement>;
  const replacablesLength = $replacables.length;
  if (replacablesLength) {
    $highestParent.style.display = displayStyle;
    $split.style.display = displayStyle;
    $split.setAttribute(dataLine, `${lineIndex}`);
    if (!isLine) {
      $split.setAttribute('data-word', `${wordIndex}`);
      if (isChar) $split.setAttribute('data-char', `${charIndex}`);
    }
    let i = replacablesLength;
    while (i--) {
      const $replace = $replacables[i];
      const $closestParent = $replace.parentElement!;
      $closestParent.style.display = displayStyle;
      if (isLine) {
        $closestParent.innerHTML = (node as HTMLElement).innerHTML;
      } else {
        $closestParent.replaceChild(node.cloneNode(true), $replace);
      }
    }
    store.push($split);
    $parentFragment.appendChild($content);
  } else {
    console.warn(`The expression "{value}" is missing from the provided template.`);
  }
  if (debug) $highestParent.style.outline = `1px dotted ${debugColors[type]}`;
  return $highestParent;
}

/**
 * A class that splits text into words and wraps them in span elements while preserving the original HTML structure.
 */
export class TextSplitter {
  debug: boolean;
  includeSpaces: boolean;
  accessible: boolean;
  linesOnly: boolean;
  lineTemplate: string | false | SplitFunctionValue;
  wordTemplate: string | false | SplitFunctionValue;
  charTemplate: string | false | SplitFunctionValue;
  $target: HTMLElement;
  html: string;
  lines: HTMLElement[];
  words: HTMLElement[];
  chars: HTMLElement[];
  effects: Array<(...args: unknown[]) => Tickable | (() => void)>;
  effectsCleanups: Array<Tickable | (() => void)>;
  cache: string | null;
  ready: boolean;
  width: number;
  resizeTimeout: ReturnType<typeof setTimeout> | null;
  resizeObserver: ResizeObserver;

  constructor(target: HTMLElement | NodeList | string | HTMLElement[], parameters: TextSplitterParams = {}) {
    if (!wordSegmenter) {
      wordSegmenter = segmenter ? new (segmenter as typeof Intl.Segmenter)([], { granularity: 'word' }) : {
        segment: (text: string) => {
          const segments: Segment[] = [];
          const words = text.split(whiteSpaceGroupRgx);
          for (let i = 0, l = words.length; i < l; i++) {
            const segment = words[i];
            segments.push({
              segment,
              isWordLike: !whiteSpaceRgx.test(segment),
            });
          }
          return segments;
        }
      };
    }
    if (!graphemeSegmenter) {
      graphemeSegmenter = segmenter ? new (segmenter as typeof Intl.Segmenter)([], { granularity: 'grapheme' }) : {
        segment: (text: string) => [...text].map(char => ({ segment: char }))
      };
    }
    if (!$splitTemplate && isBrowser) $splitTemplate = doc!.createElement('template');
    if (scope.current) scope.current.register(this);

    const { words, chars, lines, accessible, includeSpaces, debug } = parameters;
    const resolvedTarget = isArr(target) ? (target as HTMLElement[])[0] : target;
    const $target = ((resolvedTarget as Node)?.nodeType ? resolvedTarget : (getNodeList(resolvedTarget as string) || [])[0]) as HTMLElement;
    const lineParams = lines === true ? {} : lines;
    const wordParams = words === true || isUnd(words) ? {} : words;
    const charParams = chars === true ? {} : chars;

    this.debug = setValue(debug, false) as boolean;
    this.includeSpaces = setValue(includeSpaces, false) as boolean;
    this.accessible = setValue(accessible, true) as boolean;
    this.linesOnly = !!(lineParams && (!wordParams && !charParams));
    this.lineTemplate = isObj(lineParams) ? generateTemplate(lineType, lineParams as SplitTemplateParams) : (lineParams as string | false | SplitFunctionValue);
    this.wordTemplate = isObj(wordParams) || this.linesOnly ? generateTemplate(wordType, wordParams as SplitTemplateParams) : (wordParams as string | false | SplitFunctionValue);
    this.charTemplate = isObj(charParams) ? generateTemplate(charType, charParams as SplitTemplateParams) : (charParams as string | false | SplitFunctionValue);
    this.$target = $target;
    this.html = $target && $target.innerHTML;
    this.lines = [];
    this.words = [];
    this.chars = [];
    this.effects = [];
    this.effectsCleanups = [];
    this.cache = null;
    this.ready = false;
    this.width = 0;
    this.resizeTimeout = null;

    const handleSplit = () => this.html && (lineParams || wordParams || charParams) && this.split();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        const currentWidth = $target.offsetWidth;
        if (currentWidth === this.width) return;
        this.width = currentWidth;
        handleSplit();
      }, 150);
    });

    if (this.lineTemplate && !this.ready) {
      doc!.fonts.ready.then(handleSplit);
    } else {
      handleSplit();
    }

    $target ? this.resizeObserver.observe($target) : console.warn('No Text Splitter target found.');
  }

  addEffect(effect: (...args: unknown[]) => Tickable | (() => void)): this | void {
    if (!isFnc(effect)) return console.warn('Effect must return a function.');
    const refreshableEffect = keepTime(effect);
    this.effects.push(refreshableEffect as (...args: unknown[]) => Tickable | (() => void));
    if (this.ready) this.effectsCleanups[this.effects.length - 1] = refreshableEffect(this) as Tickable | (() => void);
    return this;
  }

  revert(): this {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.lines.length = this.words.length = this.chars.length = 0;
    this.resizeObserver.disconnect();
    this.effectsCleanups.forEach(cleanup => isFnc(cleanup) ? (cleanup as () => void)(this as unknown as void) : (cleanup as Tickable).revert && (cleanup as Tickable).revert());
    this.$target.innerHTML = this.html;
    return this;
  }

  splitNode(node: Node): void {
    const wordTemplate = this.wordTemplate;
    const charTemplate = this.charTemplate;
    const includeSpaces = this.includeSpaces;
    const debug = this.debug;
    const nodeType = node.nodeType;

    if (nodeType === 3) {
      const nodeText = node.nodeValue || '';
      if (nodeText.trim()) {
        const tempWords: string[] = [];
        const words = this.words;
        const chars = this.chars;
        const wordSegments = wordSegmenter!.segment(nodeText);
        const $wordsFragment = doc!.createDocumentFragment();
        let prevSeg: Segment | null = null;

        for (const wordSegment of wordSegments) {
          const segment = wordSegment.segment;
          const isWordLike = isSegmentWordLike(wordSegment);
          if (!prevSeg || (isWordLike && (prevSeg && (isSegmentWordLike(prevSeg))))) {
            tempWords.push(segment);
          } else {
            const lastWordIndex = tempWords.length - 1;
            const lastWord = tempWords[lastWordIndex];
            if (!whiteSpaceGroupRgx.test(lastWord) && !whiteSpaceGroupRgx.test(segment)) {
              tempWords[lastWordIndex] += segment;
            } else {
              tempWords.push(segment);
            }
          }
          prevSeg = wordSegment;
        }

        for (let i = 0, l = tempWords.length; i < l; i++) {
          const word = tempWords[i];
          if (!word.trim()) {
            if (i && includeSpaces) continue;
            $wordsFragment.appendChild(doc!.createTextNode(word));
          } else {
            const nextWord = tempWords[i + 1];
            const hasWordFollowingSpace = includeSpaces && nextWord && !nextWord.trim();
            const wordToProcess = word;
            const charSegments = charTemplate ? graphemeSegmenter!.segment(wordToProcess) : null;
            const $charsFragment = charTemplate ? doc!.createDocumentFragment() : doc!.createTextNode(hasWordFollowingSpace ? word + '\xa0' : word);

            if (charTemplate && charSegments) {
              const charSegmentsArray = [...charSegments];
              for (let j = 0, jl = charSegmentsArray.length; j < jl; j++) {
                const charSegment = charSegmentsArray[j];
                const isLastChar = j === jl - 1;
                const charText = isLastChar && hasWordFollowingSpace ? charSegment.segment + '\xa0' : charSegment.segment;
                const $charNode = doc!.createTextNode(charText);
                processHTMLTemplate(charTemplate, chars, $charNode, $charsFragment as DocumentFragment, charType, debug, -1, words.length, chars.length);
              }
            }

            if (wordTemplate) {
              processHTMLTemplate(wordTemplate, words, $charsFragment, $wordsFragment, wordType, debug, -1, words.length, chars.length);
            } else if (charTemplate) {
              $wordsFragment.appendChild($charsFragment);
            } else {
              $wordsFragment.appendChild(doc!.createTextNode(word));
            }

            if (hasWordFollowingSpace) i++;
          }
        }
        node.parentNode!.replaceChild($wordsFragment, node);
      }
    } else if (nodeType === 1) {
      const childNodes = [...node.childNodes] as Node[];
      for (let i = 0, l = childNodes.length; i < l; i++) this.splitNode(childNodes[i]);
    }
  }

  split(clearCache: boolean = false): this {
    const $el = this.$target;
    const isCached = !!this.cache && !clearCache;
    const lineTemplate = this.lineTemplate;
    const wordTemplate = this.wordTemplate;
    const charTemplate = this.charTemplate;
    const fontsReady = doc!.fonts.status !== 'loading';
    const canSplitLines = lineTemplate && fontsReady;
    this.ready = !lineTemplate || fontsReady;

    if (canSplitLines || clearCache) {
      this.effectsCleanups.forEach(cleanup => isFnc(cleanup) && (cleanup as (splitter: TextSplitter) => void)(this));
    }

    if (!isCached) {
      if (clearCache) {
        $el.innerHTML = this.html;
        this.words.length = this.chars.length = 0;
      }
      this.splitNode($el);
      this.cache = $el.innerHTML;
    }

    if (canSplitLines) {
      if (isCached) $el.innerHTML = this.cache!;
      this.lines.length = 0;
      if (wordTemplate) this.words = getAllTopLevelElements($el, wordType);
    }

    if (charTemplate && (canSplitLines || wordTemplate)) {
      this.chars = getAllTopLevelElements($el, charType);
    }

    const elementsArray = this.words.length ? this.words : this.chars;
    let y: number | undefined, linesCount = 0;

    for (let i = 0, l = elementsArray.length; i < l; i++) {
      const $el = elementsArray[i];
      const { top, height } = $el.getBoundingClientRect();
      if (!isUnd(y) && top - y! > height * .5) linesCount++;
      $el.setAttribute(dataLine, `${linesCount}`);
      const nested = $el.querySelectorAll(`[${dataLine}]`);
      let c = nested.length;
      while (c--) nested[c].setAttribute(dataLine, `${linesCount}`);
      y = top;
    }

    if (canSplitLines) {
      const linesFragment = doc!.createDocumentFragment();
      const parents = new Set<HTMLElement>();
      const clones: HTMLElement[] = [];

      for (let lineIndex = 0; lineIndex < linesCount + 1; lineIndex++) {
        const $clone = $el.cloneNode(true) as HTMLElement;
        filterLineElements($clone, lineIndex, new Set()).forEach($el => {
          const $parent = $el.parentNode;
          if ($parent) {
            if ($el.nodeType === 1) parents.add($parent as HTMLElement);
            $parent.removeChild($el);
          }
        });
        clones.push($clone);
      }

      parents.forEach(filterEmptyElements);

      for (let cloneIndex = 0, clonesLength = clones.length; cloneIndex < clonesLength; cloneIndex++) {
        processHTMLTemplate(lineTemplate, this.lines, clones[cloneIndex], linesFragment, lineType, this.debug, cloneIndex);
      }

      $el.innerHTML = '';
      $el.appendChild(linesFragment);
      if (wordTemplate) this.words = getAllTopLevelElements($el, wordType);
      if (charTemplate) this.chars = getAllTopLevelElements($el, charType);
    }

    if (this.linesOnly) {
      const words = this.words;
      let w = words.length;
      while (w--) {
        const $word = words[w];
        $word.replaceWith($word.textContent || '');
      }
      words.length = 0;
    }

    if (this.accessible && (canSplitLines || !isCached)) {
      const $accessible = doc!.createElement('span');
      $accessible.style.cssText = `position:absolute;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);width:1px;height:1px;white-space:nowrap;`;
      $accessible.innerHTML = this.html;
      $el.insertBefore($accessible, $el.firstChild);
      this.lines.forEach(setAriaHidden);
      this.words.forEach(setAriaHidden);
      this.chars.forEach(setAriaHidden);
    }

    this.width = $el.offsetWidth;

    if (canSplitLines || clearCache) {
      this.effects.forEach((effect, i) => this.effectsCleanups[i] = effect(this) as Tickable | (() => void));
    }

    return this;
  }

  refresh(): void {
    this.split(true);
  }
}

export function splitText(target: HTMLElement | NodeList | string | HTMLElement[], parameters?: TextSplitterParams): TextSplitter {
  return new TextSplitter(target, parameters);
}

/**
 * @deprecated text.split() is deprecated, import splitText() directly, or text.splitText()
 */
export function split(target: HTMLElement | NodeList | string | HTMLElement[], parameters?: TextSplitterParams): TextSplitter {
  console.warn('text.split() is deprecated, import splitText() directly, or text.splitText()');
  return new TextSplitter(target, parameters);
}

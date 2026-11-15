// Hanyu Pinyin syllable chart (Ministry of Education, 中文譯音使用原則, pp. 8–10),
// with standard interjections and dictionary syllables used in Mandarin.
const syllables = new Set(`
  a ai an ang ao e ê ei en eng er o ou m n ng hm hng
  ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
  pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
  ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
  fa fan fang fei fen feng fo fou fu
  da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
  ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
  na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nü nüe nuo
  la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun lü lüe luo
  ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
  ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
  ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
  ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
  qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
  xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
  zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo
  cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo
  sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo
  ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
  za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo
  ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo
  sa sai san sang sao se sen seng si song sou su suan sui sun suo
  wa wai wan wang wei wen weng wo wu
  ya yai yan yang yao ye yi yin ying yo yong you yu yuan yue yun
`.trim().split(/\s+/));
const maxSyllableLength = Math.max(...Array.from(syllables, syllable => syllable.length));
const toneMarks: Record<string, string> = { '\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0300': '4' };

function readSyllablePart(value: string) {
  const tones: string[] = [];
  const letters = value.normalize('NFD').replace(/[\u0304\u0301\u030c\u0300]/g, mark => {
    tones.push(toneMarks[mark]);
    return '';
  }).normalize('NFC').replace(/v/g, 'ü').replace(/V/g, 'Ü');
  return { letters, tones };
}

function splitUnnumbered(word: string): string[] {
  const parts = (word.normalize('NFD').match(/\P{M}\p{M}*|\p{M}+/gu) ?? []).map(readSyllablePart);
  // Work backwards so the longest match is chosen only if the remaining syllables can also be split.
  const splits: ({ end: number; value: string } | undefined)[] = new Array(parts.length);
  for (let start = parts.length - 1; start >= 0; start--) {
    for (let end = Math.min(start + maxSyllableLength, parts.length); end > start; end--) {
      if (end !== parts.length && !splits[end]) continue;
      const span = parts.slice(start, end);
      const letters = span.map(part => part.letters).join('');
      if (!syllables.has(letters.toLowerCase())) continue;
      const tones = span.flatMap(part => part.tones);
      if (tones.length > 1) continue;
      splits[start] = { end, value: letters + (tones[0] ?? '5') };
      break;
    }
  }
  // Preserve an unrecognized chunk as one error token.
  let split: (typeof splits)[number] = splits[0];
  if (!split) return [word];
  const result: string[] = [];
  while (split) {
    result.push(split.value);
    split = splits[split.end];
  }
  return result;
}

export function pinyinSyllables(value: string) {
  return value.split(/\s+|(?<=[0-5])(?=\p{L})/u).filter(Boolean).flatMap(chunk => {
    const numberedTone = chunk.match(/[0-5]$/)?.[0];
    if (!numberedTone) return splitUnnumbered(chunk);
    const { letters, tones } = readSyllablePart(chunk.slice(0, -1));
    const tone = numberedTone === '0' ? '5' : numberedTone;
    return [tones.length > 1 || (tones.length === 1 && tones[0] !== tone) ? chunk : letters + tone];
  });
}

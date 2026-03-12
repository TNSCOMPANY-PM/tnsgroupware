/**
 * 시드 기반 일일 운세 생성 (외부 API 없이 사용자·날짜로 동일 결과 보장)
 */

export type HoroscopeUser = {
  name: string;
  birthdate?: string;
  gender?: string;
};

export type DailyHoroscope = {
  totalFortune: string;
  wealthLuck: number;
  workLuck: number;
  luckyColor: string;
  luckyColorHex: string;
  /** 로또 추천 번호 6개 (1~45, 중복 없음, 시드 기반) */
  lottoNumbers: number[];
};

/** 문자열을 해시 숫자로 변환 (djb2 스타일) */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h >>> 0);
}

/** 시드와 step으로 배열 인덱스 생성 (같은 시드라도 step마다 다른 값) */
function seededIndex(seed: number, length: number, step: number): number {
  const mixed = (seed + step * 7919) >>> 0;
  return mixed % length;
}

/** 시드 기반으로 1~45 중 중복 없이 6개 번호 생성 (로또 형식) */
function generateSeededLotto(seed: number): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (seed + (i + 1) * 7919 + i * 31) >>> 0;
    const swapIdx = j % (i + 1);
    [pool[i], pool[swapIdx]] = [pool[swapIdx]!, pool[i]!];
  }
  return pool.slice(0, 6).sort((a, b) => a - b);
}

/** 총운 문장 (긍정·희망적, 10~15개) */
const TOTAL_FORTUNE_SENTENCES = [
  "오늘은 협업이 잘 맞는 날입니다. 팀원들과 소통을 활발히 해보세요.",
  "새로운 아이디어가 빛을 발할 수 있는 날입니다. 자신감을 갖고 제안해 보세요.",
  "재물운이 상승하는 날. 중요한 계약이나 협상에 유리합니다.",
  "인맥운이 좋은 날입니다. 새로운 인연을 만날 수 있어요.",
  "창의성이 폭발하는 날. 기획 회의에 최적의 타이밍입니다.",
  "조급함보다 여유가 필요해요. 한 걸음 물러서 보는 것이 좋습니다.",
  "오늘 하루 작은 결단이 큰 성과로 이어질 수 있습니다. 믿고 나아가세요.",
  "주변의 조언이 귀한 날. 열린 마음으로 듣다 보면 좋은 기회가 보입니다.",
  "일에 대한 열정이 주목받는 날. 당당하게 자신의 의견을 전해 보세요.",
  "소소한 행운이 모이는 날. 긍정적인 말 한마디가 분위기를 바꿉니다.",
  "오후로 갈수록 운세가 올라갑니다. 중요한 일은 오후에 진행해 보세요.",
  "오늘 만난 사람 중에서 인생의 동반자가 나올 수 있어요. 눈을 크게 뜨고 다니세요.",
  "재물·업무 모두 무난한 하루. 꾸준함이 빛을 발하는 날입니다.",
  "작은 도전이 큰 보상으로 돌아오는 날. 두려워하지 말고 한 걸음 내딛어 보세요.",
  "감사한 마음을 전하면 좋은 일이 생깁니다. 주변에 감사 인사를 전해 보세요.",
];

/** 행운의 색상 (이름 + hex) */
const LUCKY_COLORS: { name: string; hex: string }[] = [
  { name: "인디고", hex: "#4f46e5" },
  { name: "에메랄드", hex: "#10b981" },
  { name: "앰버", hex: "#f59e0b" },
  { name: "로즈", hex: "#f43f5e" },
  { name: "바이올렛", hex: "#8b5cf6" },
  { name: "스카이", hex: "#0ea5e9" },
  { name: "청록", hex: "#14b8a6" },
  { name: "코랄", hex: "#f97316" },
];

/**
 * 사용자 정보와 날짜를 시드로 삼아 오늘의 운세를 생성합니다.
 * 같은 사용자·같은 날짜면 항상 동일한 결과를 반환합니다.
 */
export function generateDailyHoroscope(
  user: HoroscopeUser,
  dateStr: string
): DailyHoroscope {
  const seedStr = [user.name, user.birthdate ?? "", user.gender ?? "", dateStr].join("|");
  const seed = hashString(seedStr);

  const totalIndex = seededIndex(seed, TOTAL_FORTUNE_SENTENCES.length, 0);
  const wealthLuck = (seededIndex(seed, 5, 1)) + 1;
  const workLuck = (seededIndex(seed, 5, 2)) + 1;
  const colorIndex = seededIndex(seed, LUCKY_COLORS.length, 3);
  const lottoNumbers = generateSeededLotto(seed);

  return {
    totalFortune: TOTAL_FORTUNE_SENTENCES[totalIndex] ?? TOTAL_FORTUNE_SENTENCES[0]!,
    wealthLuck,
    workLuck,
    luckyColor: LUCKY_COLORS[colorIndex]!.name,
    luckyColorHex: LUCKY_COLORS[colorIndex]!.hex,
    lottoNumbers,
  };
}

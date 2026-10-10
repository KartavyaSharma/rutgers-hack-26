// Red-flag phrases checked BEFORE the LLM. A match goes straight to the nurse as urgent.
// Patterns are regex sources written against `normalizeText` output: lowercase, no accents,
// no apostrophes ("can't" -> "cant"), punctuation turned into single spaces.
// False positives are acceptable here (the nurse gets an urgent call); misses are not.
import { guessLanguage, normalizeText, type SupportedLanguage } from './language'

export const RED_FLAG_CATEGORIES = [
  'unresponsive',
  'breathing',
  'choking',
  'chest_pain',
  'stroke_signs',
  'seizure',
  'allergic_reaction',
  'bleeding',
  'self_harm',
  'overdose',
  'fall',
  'severe_pain',
  'emergency',
] as const
export type RedFlagCategory = (typeof RED_FLAG_CATEGORIES)[number]

/** English label for staff screens, e.g. "chest pain". */
export const RED_FLAG_LABELS: Record<RedFlagCategory, string> = {
  unresponsive: 'unresponsive / fainted',
  breathing: 'trouble breathing',
  choking: 'choking',
  chest_pain: 'chest pain',
  stroke_signs: 'possible stroke signs',
  seizure: 'seizure',
  allergic_reaction: 'allergic reaction',
  bleeding: 'bleeding',
  self_harm: 'self-harm risk',
  overdose: 'possible overdose',
  fall: 'fall',
  severe_pain: 'severe pain',
  emergency: 'emergency',
}

export interface RedFlagMatch {
  /** The phrase as it appears in the (normalized) patient text, e.g. "cant breathe". */
  phrase: string
  /** Best guess of the patient's language, e.g. "en", "es". */
  language: string
  category: RedFlagCategory
}

type PatternTable = Partial<Record<RedFlagCategory, ReadonlyArray<string>>>

// Space-separated languages: matched on word boundaries.
const WORD_PATTERNS: ReadonlyArray<readonly [SupportedLanguage, PatternTable]> = [
  [
    'en',
    {
      unresponsive: [
        'unconscious',
        'unresponsive',
        'pass(ed|ing)? out',
        'faint(ed|ing)?',
        'i blacked out',
        'collapsed',
        '(wont|will not|cant|cannot|can not) wake (up|him|her|them)',
        'not waking up',
      ],
      breathing: [
        '(cant|cannot|can not|unable to|couldnt|struggling to|hard to|difficult to|trouble|difficulty|hard time|problems?) breath(e|ing)?',
        'short(ness)? of breath',
        '(cant|cannot|can not) catch my breath',
        '(not|stopped|isnt|is not) breathing',
        'gasping( for air)?',
        'breathless',
      ],
      choking: [
        'chok(e|es|ed|ing)',
        '(cant|cannot|can not) swallow',
        'something (is )?stuck in my throat',
      ],
      chest_pain: [
        'chest (pain|pains|hurts|is hurting|hurting|is tight|feels tight|tightness|pressure)',
        '(pain|pressure|tightness|squeezing) in (my |the )?chest',
        'heart attack',
        'crushing pain',
      ],
      stroke_signs: [
        'stroke',
        'face (is )?(drooping|droopy|numb)',
        '(drooping|droopy) face',
        'face droop',
        '(cant|cannot|can not) (move|feel|lift) my (arm|arms|leg|legs|hand|face|left|right)',
        'slurr(ed|ing)',
        'sudden(ly)? (numbness|weakness|confusion|numb|weak|confused)',
        '(one side|half) of my (face|body)',
        'worst headache',
      ],
      seizure: ['seizures?', 'seizing', 'convuls\\w*', '(having|had) a fit'],
      allergic_reaction: [
        'allergic reaction',
        'anaphyla\\w*',
        'throat (is )?(swelling|swollen|closing|tight)',
        '(swelling|swollen) (throat|tongue|lips|face)',
        '(tongue|lips|face) (is |are )?(swelling|swollen)',
        'hives',
        'epipen',
      ],
      bleeding: [
        'bleed(ing|s)?',
        'blood everywhere',
        'lots? of blood',
        '(coughing|vomiting|throwing|spitting) up blood',
        'vomiting blood',
        'hemorrhag\\w*',
      ],
      self_harm: [
        'suicid\\w*',
        'kill(ing)? myself',
        '(want|wanna|going) to die',
        'wanna die',
        'end my life',
        '(want|going|gonna|wanna|thinking about|thoughts of) (to )?(hurt|harm|cut|kill)(ing)? myself',
        'harm(ing)? myself',
        '(dont|do not) want to (live|be alive)',
        'better off dead',
        'take my (own )?life',
      ],
      overdose: ['overdos\\w*', 'too many (pills|meds|tablets)', 'took too much'],
      fall: [
        '(i|he|she|they|we|someone|somebody|my (mom|mother|dad|father|husband|wife|son|daughter|roommate|partner)) (just )?fell(?! asleep)',
        '(ive|i have|has|have) (just )?fallen(?! asleep)',
        'fell (down|over|out of (the |my )?bed)',
        '(slipped|tripped) and fell',
        'had a fall',
        'fall(ing)? out of (the |my )?bed',
        '(im|i am|hes|he is|shes|she is|lying|laying|stuck) on the (floor|ground)',
        'i (slipped|tripped)',
      ],
      severe_pain: [
        '(severe|extreme|unbearable|excruciating|terrible|horrible|intense|agonizing|worst) pain',
        'excruciating',
        'pain is (so |really )?(unbearable|excruciating|severe|terrible|horrible|awful)',
        'in agony',
        'pain is (a )?(10|ten)',
        '(10|ten) out of (10|ten)',
      ],
      emergency: ['(?<!not an )(?<!no )emergency', 'call 911', '911', 'code blue'],
    },
  ],
  [
    'es',
    {
      unresponsive: [
        'inconsciente',
        'desmay\\w*',
        'perd(i|io) el conocimiento',
        'no despierta',
        'no reacciona',
      ],
      breathing: [
        'no (puedo|puede) respirar',
        '(me cuesta|le cuesta|dificultad para|problemas para) respirar',
        'me falta (el )?aire(?! acondicionado)',
        'falta de aire(?! acondicionado)',
        'no respira',
        'me (estoy )?ahog(o|ando)',
      ],
      choking: ['atragant\\w*', 'no puedo tragar', 'se me atoro', 'atorad[oa]'],
      chest_pain: [
        'dolor (en el|de|del) pecho',
        'me duele (el|mi) pecho',
        'duele el pecho',
        '(presion|opresion) en el pecho',
        'pecho apretado',
        'ataque (al|de) corazon',
        'infarto',
      ],
      stroke_signs: [
        'derrame( cerebral)?',
        'ictus',
        'embolia',
        'cara (caida|torcida|dormida)',
        'no puedo mover (el |mi |la )?(brazo|pierna|mano|cara)',
        'no siento (el |mi |la )?(brazo|pierna|mano|cara)',
        'no puedo hablar',
      ],
      seizure: ['convulsi\\w*', 'ataque epileptico', 'crisis epileptica'],
      allergic_reaction: [
        'reaccion alergica',
        'anafila\\w*',
        '(se me cierra|se cierra|cerrando) la garganta',
        'garganta (hinchada|cerrada)',
        '(lengua|labios|cara) hinchad[oa]s?',
        'ronchas',
      ],
      bleeding: [
        'sangr(ando|a|ado)',
        'hemorragia',
        'mucha sangre',
        '(vomitando|tosiendo|escupiendo) sangre',
      ],
      self_harm: [
        'suicid\\w*',
        'quiero morir(me)?',
        'matarme',
        'no quiero vivir',
        'quitarme la vida',
        'hacerme dano',
      ],
      overdose: ['sobredosis'],
      fall: [
        'me cai',
        'me he caido',
        '(mi (esposo|esposa|marido|mujer|madre|padre|mama|papa|hijo|hija)|el|ella|alguien) se (cayo|ha caido)',
        '(estoy|esta|tirad[oa]|quede) en el (suelo|piso)',
        'una caida',
        'no me puedo levantar',
        'no puedo levantarme',
      ],
      severe_pain: [
        'dolor (muy )?(fuerte|intenso|severo|insoportable|terrible|horrible)',
        'mucho(simo)? dolor',
        'me duele (mucho|muchisimo)',
      ],
      emergency: ['(?<!no es una )emergencia'],
    },
  ],
  [
    'pt',
    {
      unresponsive: ['desmai\\w*', 'inconsciente', 'perdi (a )?consciencia', 'nao acorda'],
      breathing: [
        'nao (consigo|consegue) respirar',
        'falta de ar',
        'dificuldade (para|de|em) respirar',
        'sem ar(?! condicionado)',
      ],
      choking: ['engasg\\w*', 'nao consigo engolir'],
      chest_pain: ['dor no peito', '(aperto|pressao) no peito', 'ataque cardiaco'],
      stroke_signs: [
        'avc',
        'derrame',
        'rosto (caido|torto|dormente)',
        'boca torta',
        'nao consigo mexer (o |meu |a |minha )?(braco|perna|mao)',
      ],
      seizure: ['convuls\\w*', 'crise epileptica'],
      allergic_reaction: ['reacao alergica', 'anafila\\w*', 'garganta (fechando|inchada|inchando)'],
      bleeding: ['sangrando', 'sangramento', 'hemorragia', 'muito sangue'],
      self_harm: ['suicid\\w*', 'quero morrer', 'me matar', 'nao quero (mais )?viver'],
      overdose: ['overdose'],
      fall: [
        'eu cai',
        '(ele|ela) caiu',
        'cai no chao',
        '(estou|esta|to|caid[oa]|deitad[oa]) no chao',
        'uma queda',
        'levei um tombo',
      ],
      severe_pain: ['dor (muito )?(forte|intensa|insuportavel|terrivel)', 'muita dor'],
      emergency: ['(?<!nao e uma )emergencia'],
    },
  ],
  [
    'fr',
    {
      unresponsive: ['inconscient\\w*', 'evanoui\\w*', 'perdu connaissance', 'fait un malaise'],
      breathing: [
        '(je ne peux pas|je narrive pas a|jarrive pas a|du mal a|difficulte a) respirer',
        'essouffle\\w*',
        'manque dair',
        'jetouffe',
      ],
      choking: ['je metouffe', 'sest etouffe\\w*', 'etouffe(ment)?'],
      chest_pain: [
        '(douleurs?|mal) (a|dans) la poitrine',
        'poitrine (me fait mal|serree)',
        'crise cardiaque',
      ],
      stroke_signs: [
        'avc',
        'visage (paralyse|tombant|engourdi)',
        'je ne peux (pas|plus) bouger (le |mon |la |ma )?(bras|jambe|main)',
      ],
      seizure: ['convulsion\\w*', 'crise (depilepsie|depileptique)'],
      allergic_reaction: [
        'reaction allergique',
        'anaphyla\\w*',
        'gorge (gonflee|qui gonfle|se ferme|serree)',
      ],
      bleeding: ['je saigne', 'saign\\w*', 'hemorragie', 'beaucoup de sang'],
      self_harm: ['suicid\\w*', '(je veux|envie de) mourir', 'me tuer', 'en finir'],
      overdose: ['surdose', 'overdose'],
      fall: [
        'je suis tombee?',
        '(il|elle) est tombee?',
        '(je suis|suis|il est|elle est|allonge\\w*|couche\\w*) par terre',
        'une chute',
      ],
      severe_pain: ['douleur (insupportable|atroce|intense|terrible|tres forte)', 'jai tres mal'],
      emergency: ['(?<!pas une )urgence'],
    },
  ],
  [
    'de',
    {
      unresponsive: ['bewusstlos', 'ohnmacht\\w*', 'umgekippt'],
      breathing: [
        '(ich )?kann nicht (mehr )?atmen',
        '(ich )?(bekomme|kriege) keine luft',
        'atemnot',
      ],
      choking: ['ich ersticke', 'erstick\\w*', 'verschluckt'],
      chest_pain: [
        'brustschmerz\\w*',
        'schmerzen in der brust',
        'engegefuhl in der brust',
        'herzinfarkt',
      ],
      stroke_signs: [
        'schlaganfall',
        'gesicht (hangt|ist taub)',
        'kann (meinen|mein|meine) (arm|bein|hand) nicht (mehr )?bewegen',
      ],
      seizure: ['krampfanfall', 'epilepti\\w*'],
      allergic_reaction: ['allergische reaktion', 'anaphyla\\w*', 'hals schwillt'],
      bleeding: ['ich blute', 'blutung', 'blutet'],
      self_harm: ['suizid\\w*', 'selbstmord', 'ich will sterben', 'mich umbringen'],
      fall: ['ich bin (hin)?gefallen', '(er|sie) ist (hin)?gefallen', 'gesturzt', 'ein sturz'],
      severe_pain: ['(starke|unertragliche|furchtbare|schlimme) schmerzen'],
      emergency: ['(?<!kein )notfall'],
    },
  ],
  [
    'it',
    {
      unresponsive: ['svenut[oa]', 'svengo', 'incoscient\\w*', 'perso i sensi'],
      breathing: [
        'non riesco a respirare',
        'non respiro',
        'fiato corto',
        'mi manca (il )?(fiato|respiro|aria)',
      ],
      choking: ['soffoc\\w*'],
      chest_pain: ['dolore al petto', 'mi fa male il petto', 'infarto'],
      stroke_signs: [
        'ictus',
        'non riesco a muovere (il |la )?(braccio|gamba|mano)',
        '(faccia|bocca) storta',
      ],
      seizure: ['convulsion\\w*', 'crisi epilettica'],
      allergic_reaction: ['reazione allergica', 'anafila\\w*', 'gola (gonfia|chiusa)'],
      bleeding: ['sanguin\\w*', 'emorragia', 'perdo sangue'],
      self_harm: ['suicid\\w*', 'voglio morire', 'uccidermi'],
      fall: ['sono cadut[oa]', '(lui|lei) e cadut[oa]', 'una caduta'],
      severe_pain: ['dolore (fortissimo|insopportabile|atroce|forte)'],
      emergency: ['(?<!non e un )emergenza'],
    },
  ],
  [
    'nl',
    {
      unresponsive: ['bewusteloos', 'flauw ?gevallen'],
      breathing: ['(ik )?kan niet (meer )?ademen', 'benauwd', 'kortademig', 'geen lucht'],
      choking: ['ik stik', 'stikken', 'verslikt'],
      chest_pain: ['pijn (op|in) (de|mijn) borst', 'borstpijn', 'hartaanval'],
      stroke_signs: [
        'beroerte',
        'herseninfarct',
        'scheve mond',
        'kan mijn (arm|been|hand) niet (meer )?bewegen',
      ],
      seizure: ['epileptische aanval', 'stuip\\w*'],
      allergic_reaction: ['allergische reactie', 'anafyla\\w*', 'keel (zwelt|zit dicht)'],
      bleeding: ['ik bloed', 'bloeding', 'bloedt'],
      self_harm: ['zelfmoord', 'suicid\\w*', 'ik wil dood', 'wil niet meer leven'],
      fall: ['ik ben gevallen', '(hij|zij|ze) is gevallen'],
      severe_pain: ['(ondraaglijke|heel erge|vreselijke) pijn'],
      emergency: ['(?<!geen )noodgeval'],
    },
  ],
]

// Languages written without spaces between words (or where we match inflected stems): substring match.
const SUBSTRING_PATTERNS: ReadonlyArray<readonly [SupportedLanguage, PatternTable]> = [
  [
    'zh',
    {
      unresponsive: ['昏迷', '晕倒', '昏倒', '失去知觉', '不省人事', '晕过去'],
      breathing: ['喘不过气', '喘不上气', '呼吸困难', '不能呼吸', '无法呼吸', '透不过气'],
      choking: ['噎住', '噎到', '呛到'],
      chest_pain: ['胸口痛', '胸口疼', '胸痛', '胸口闷', '胸闷', '心脏病发作', '心口痛'],
      stroke_signs: ['中风', '脑卒中', '嘴歪', '半边身体', '说话不清'],
      seizure: ['抽搐', '癫痫'],
      allergic_reaction: ['过敏反应', '喉咙肿', '喉咙发紧', '严重过敏'],
      bleeding: ['流血', '出血'],
      self_harm: ['自杀', '想死', '不想活'],
      fall: ['摔倒', '跌倒', '摔了一跤', '摔下床'],
      severe_pain: ['剧痛', '疼得受不了', '痛得受不了'],
    },
  ],
  [
    'hi',
    {
      unresponsive: ['बेहोश'],
      breathing: ['सांस नहीं', 'साँस नहीं', 'सांस लेने में', 'साँस लेने में', 'दम घुट'],
      choking: ['गले में अटक'],
      chest_pain: ['सीने में दर्द', 'छाती में दर्द', 'दिल का दौरा'],
      stroke_signs: ['लकवा', 'स्ट्रोक', 'मुंह टेढ़ा'],
      seizure: ['दौरा पड़', 'मिर्गी'],
      allergic_reaction: ['गला सूज', 'गले में सूजन'],
      bleeding: ['खून बह', 'खून निकल', 'रक्तस्राव'],
      self_harm: ['आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'जीना नहीं चाहता', 'जीना नहीं चाहती'],
      fall: ['मैं गिर', 'गिर पड़ा', 'गिर पड़ी'],
      severe_pain: ['बहुत तेज दर्द', 'बहुत तेज़ दर्द', 'असहनीय दर्द', 'बहुत ज्यादा दर्द', 'बहुत ज़्यादा दर्द'],
    },
  ],
  [
    'ru',
    {
      unresponsive: ['без сознания', 'потерял сознание', 'потеряла сознание', 'обморок'],
      breathing: ['не могу дышать', 'задыха', 'нечем дышать', 'одышк'],
      choking: ['подавился', 'подавилась', 'поперхнул'],
      chest_pain: ['боль в груди', 'болит грудь', 'болит в груди', 'сердечный приступ', 'инфаркт'],
      stroke_signs: ['инсульт', 'не могу пошевелить', 'лицо перекосило'],
      seizure: ['судорог', 'припадок', 'эпилептич'],
      allergic_reaction: ['аллергическая реакция', 'горло опухает', 'отек горла', 'анафилак'],
      bleeding: ['кровотеч', 'истекаю кровью', 'идет кровь', 'идёт кровь'],
      self_harm: ['суицид', 'покончить с собой', 'хочу умереть', 'убить себя'],
      fall: ['я упал', 'я упала', 'упал с кровати', 'упала с кровати'],
      severe_pain: ['сильная боль', 'невыносимая боль', 'очень больно'],
    },
  ],
  [
    'ja',
    {
      unresponsive: ['意識がない', '気を失', '失神'],
      breathing: ['息ができない', '息が苦しい', '呼吸ができない', '呼吸が苦しい'],
      choking: ['喉に詰ま', '窒息'],
      chest_pain: ['胸が痛い', '胸の痛み', '胸が苦しい', '心臓発作'],
      stroke_signs: ['脳卒中', 'ろれつが回らない', '顔が歪', '腕が動かない'],
      seizure: ['けいれん', '痙攣', '発作'],
      allergic_reaction: ['アレルギー反応', '喉が腫れ', 'アナフィラキシー'],
      bleeding: ['出血', '血が止まらない'],
      self_harm: ['死にたい', '自殺'],
      fall: ['転んだ', '転倒', 'ベッドから落ち'],
      severe_pain: ['激痛', 'ひどい痛み'],
    },
  ],
]

interface CompiledPattern {
  readonly category: RedFlagCategory
  readonly language: SupportedLanguage
  readonly regex: RegExp
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Compiled once, ordered by category severity so the reported category is the most serious one.
const COMPILED: ReadonlyArray<CompiledPattern> = RED_FLAG_CATEGORIES.flatMap((category) => [
  ...WORD_PATTERNS.flatMap(([language, table]) => {
    const sources = table[category]
    if (sources === undefined || sources.length === 0) return []
    const regex = new RegExp(`(?:^| )(${sources.map((s) => `(?:${s})`).join('|')})(?= |$)`, 'u')
    return [{ category, language, regex }]
  }),
  ...SUBSTRING_PATTERNS.flatMap(([language, table]) => {
    const phrases = table[category]
    if (phrases === undefined || phrases.length === 0) return []
    // Phrases go through the same normalization as the text (NFD etc.) before matching.
    const regex = new RegExp(
      `(${phrases.map((p) => escapeRegex(normalizeText(p))).join('|')})`,
      'u',
    )
    return [{ category, language, regex }]
  }),
])

/**
 * Look for red-flag phrases (chest pain, can't breathe, fell, bleeding, choking, stroke signs,
 * unconscious, severe pain, suicidal, allergic reaction, seizure, ...) in the 10 room languages
 * (en es fr de hi ru pt ja it nl) plus Chinese. Returns null when nothing matches.
 */
export const detectRedFlag = (text: string): RedFlagMatch | null => {
  const normalized = normalizeText(text)
  if (normalized.length === 0) return null
  for (const pattern of COMPILED) {
    const match = pattern.regex.exec(normalized)
    if (match !== null) {
      return {
        phrase: (match[1] ?? match[0]).trim(),
        language: guessLanguage(text) ?? pattern.language,
        category: pattern.category,
      }
    }
  }
  return null
}

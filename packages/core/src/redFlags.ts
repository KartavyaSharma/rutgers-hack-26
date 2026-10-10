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
  [
    'tl',
    {
      unresponsive: ['nawalan (siya )?ng malay', 'walang malay', '(hinimatay|nahimatay)'],
      breathing: [
        'hindi (ako |siya )?makahinga',
        '(hirap|nahihirapan|nahihirapang) (akong |siyang )?huminga',
        'kinakapos (ako )?(ng|sa) hininga',
      ],
      choking: ['nabubulunan', 'nabulunan', 'nabilaukan'],
      chest_pain: [
        '(masakit|sumasakit) ang (aking )?dibdib',
        'sakit (sa|ng) dibdib',
        'atake sa puso',
      ],
      stroke_signs: [
        'stroke',
        'hindi ko maigalaw ang (aking )?(braso|binti|kamay|mukha)',
        'tabingi ang (mukha|bibig)',
      ],
      bleeding: ['dumudugo', 'nagdurugo', 'maraming dugo'],
      self_harm: [
        'gusto ko nang mamatay',
        'magpapakamatay',
        'magpakamatay',
        'patayin ang sarili ko',
      ],
      // "nahulog ako" (I fell); "nahulog ang telepono ko" (my phone fell) does not match.
      fall: ['(nahulog|natumba|nadulas|bumagsak) ako'],
      severe_pain: ['sobrang sakit', 'napakasakit', 'hindi ko na kaya ang sakit'],
      emergency: ['saklolo'],
    },
  ],
  [
    'ht',
    {
      unresponsive: ['endispoze', 'pedi konesans', 'san konesans'],
      breathing: [
        '(mwen|m) pa (ka|kapab) respire',
        'mpa (ka|kapab) respire',
        'difikilte pou respire',
        'kout souf',
        'souf mwen kout',
      ],
      choking: ['(m ap|map|mwen ap) toufe', 'toufe'],
      chest_pain: ['doule nan pwatrin', 'pwatrin (mwen )?(ap )?fe (mwen )?mal', 'kriz kadyak'],
      stroke_signs: [
        'konjesyon serebral',
        'estwok',
        'figi mwen (tode|kwochi)',
        '(mwen|m) pa ka bouje (bra|janm|men) mwen',
      ],
      bleeding: ['(m ap|map|mwen ap) senyen', 'senyen anpil', 'pedi san'],
      self_harm: ['(mwen|m) vle mouri', 'touye tet mwen', 'swisid'],
      // Only at the start: "telefon mwen tonbe" (my phone fell) must not match.
      fall: ['(?<![a-z] )(mwen |m ?)(sot |fek )?tonbe'],
      severe_pain: ['doule (a )?(twop|grav)', '(m ap|map) soufri anpil'],
      emergency: ['anmwe', '(?<!pa yon )ijans'],
    },
  ],
  [
    'vi',
    {
      unresponsive: ['bat tinh', 'ngat xiu', 'bi (ngat|xiu)', 'hon me'],
      breathing: ['khong (the )?tho( duoc)?', 'khong tho noi', 'kho tho', 'nghet tho', 'ngop tho'],
      choking: ['bi (nghen|hoc)', 'mac nghen'],
      chest_pain: ['dau (o )?nguc', 'tuc nguc', 'dau tim', 'nhoi mau co tim', 'len con dau tim'],
      stroke_signs: [
        'dot quy',
        'tai bien',
        'meo (mieng|mat)',
        'khong cu dong (duoc )?(tay|chan)',
        'liet (nua nguoi|tay|chan)',
      ],
      bleeding: ['chay mau', 'mat mau', 'ra (nhieu )?mau'],
      // Not "tu tu": that is also "từ từ" (slowly).
      self_harm: ['muon chet', 'tu sat', 'ket lieu (cuoc doi|ban than)'],
      // People fall (ngã, té); objects drop (rơi), which is not listed.
      fall: [
        '(toi|em|con|me|ba|ong) (bi )?(nga|te)',
        'nga xuong',
        'te nga',
        '(nga|te) khoi giuong',
      ],
      severe_pain: [
        'dau qua',
        'dau du doi',
        'dau khung khiep',
        'dau kinh khung',
        'dau khong chiu noi',
      ],
      emergency: ['cuu (toi|voi|em|con|me)', '(?<!khong phai )cap cuu'],
    },
  ],
  [
    'pl',
    {
      unresponsive: ['zemdlal(em|am|a)?', 'stracil(em|am|a)? przytomnosc', 'nieprzytomn\\w*'],
      breathing: [
        'nie moge oddychac',
        'nie moge zlapac (tchu|oddechu)',
        'brak mi tchu',
        'dusze sie',
        'dusi mnie',
        'dusznosc',
      ],
      choking: ['(zakrztusil|zadlawil)(em|am|a)? sie', '(krztusze|dlawie) sie'],
      chest_pain: [
        'bol w klatce( piersiowej)?',
        'boli mnie (w )?klat(ka|ce)',
        'zawal( serca)?',
        'ucisk w klatce',
      ],
      stroke_signs: [
        'udar',
        'nie moge ruszyc (reka|noga|dlonia)',
        'krzywa twarz',
        'opadniety kacik ust',
        'belkocze',
      ],
      seizure: ['atak padaczki', 'drgawki'],
      allergic_reaction: ['reakcja alergiczna', 'puchnie mi gardlo'],
      bleeding: ['krwawie', 'krwawienie', 'krwotok', 'duzo krwi', 'leci (mi )?krew'],
      self_harm: ['chce umrzec', 'zabic sie', 'samobojstw\\w*', 'samobojcz\\w*'],
      // "upadłem/upadłam" (I fell); "telefon mi upadł" (my phone fell) does not match.
      fall: [
        'upadl(em|am)',
        '(on|ona) upadl(a)?',
        'przewrocil(em|am) sie',
        'spadl(em|am) z lozka',
        'leze na podlodze',
      ],
      severe_pain: ['(silny|straszny|okropny) bol', 'nie do wytrzymania'],
      emergency: ['ratunku', '(?<!to nie )nagly wypadek'],
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
  [
    'ar',
    {
      unresponsive: ['فقد الوعي', 'فقدت الوعي', 'أغمي عليه', 'أغمي علي', 'إغماء'],
      breathing: [
        'لا أستطيع التنفس',
        'لا أقدر أتنفس',
        'مش قادر أتنفس',
        'ضيق في التنفس',
        'صعوبة في التنفس',
        'ضيق تنفس',
      ],
      choking: ['أختنق', 'اختناق', 'يختنق'],
      chest_pain: [
        'ألم في الصدر',
        'ألم في صدري',
        'ألم بالصدر',
        'صدري يؤلمني',
        'وجع في صدري',
        'نوبة قلبية',
        'ذبحة صدرية',
        'جلطة قلبية',
      ],
      stroke_signs: [
        'جلطة دماغية',
        'سكتة دماغية',
        'لا أستطيع تحريك يدي',
        'لا أستطيع تحريك ذراعي',
        'لا أستطيع تحريك رجلي',
        'وجهي مائل',
        'فمي مائل',
      ],
      bleeding: ['أنزف', 'نزيف', 'ينزف', 'تنزف', 'دم كثير'],
      self_harm: ['أريد أن أموت', 'انتحار', 'أقتل نفسي'],
      // Without vowel marks "سقطت" is also "it (f.) fell", so only the first person is listed.
      fall: ['أنا سقطت', 'أنا وقعت', 'وقعت من السرير'],
      severe_pain: ['ألم شديد', 'ألم لا يحتمل', 'وجع شديد'],
      emergency: ['النجدة', 'الحقوني', 'إسعاف'],
    },
  ],
  [
    'ko',
    {
      unresponsive: ['의식이 없', '의식을 잃', '기절', '쓰러질 것 같'],
      breathing: [
        '숨을 못 쉬',
        '숨을 쉴 수 없',
        '숨쉬기 힘들',
        '숨쉬기가 힘들',
        '숨이 차',
        '호흡곤란',
      ],
      choking: ['목에 걸렸', '숨이 막혀', '사레'],
      chest_pain: [
        '가슴이 아파',
        '가슴이 아픕',
        '가슴 통증',
        '흉통',
        '가슴이 답답',
        '가슴이 조여',
        '심장마비',
      ],
      stroke_signs: [
        '뇌졸중',
        '중풍',
        '팔을 움직일 수 없',
        '다리를 움직일 수 없',
        '말이 어눌',
        '얼굴이 마비',
        '입이 돌아갔',
      ],
      bleeding: ['피가 나', '피가 많이', '출혈'],
      self_harm: ['죽고 싶', '자살'],
      // "넘어졌어요" is also used for chairs and IV poles, so only people are listed.
      fall: [
        '제가 넘어졌',
        '내가 넘어졌',
        '저 넘어졌',
        '넘어져서 못 일어나',
        '낙상',
        '엄마가 넘어졌',
        '어머니가 넘어졌',
        '아버지가 넘어졌',
        '남편이 넘어졌',
        '아내가 넘어졌',
        '환자가 넘어졌',
      ],
      severe_pain: ['너무 아파', '너무 아픕', '극심한 통증', '심한 통증'],
      // Not "도와주세요" (please help), which is any request.
      emergency: ['살려 주세요', '살려줘', '구급차'],
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
      // A space in a phrase is optional, since spacing varies (Korean especially).
      `(${phrases.map((p) => escapeRegex(normalizeText(p)).replace(/ /g, ' ?')).join('|')})`,
      'u',
    )
    return [{ category, language, regex }]
  }),
])

/**
 * Look for red-flag phrases (chest pain, can't breathe, fell, bleeding, choking, stroke signs,
 * unconscious, severe pain, suicidal, allergic reaction, seizure, ...) in the 12 room languages
 * (en es zh tl ht pt ru ar hi ko vi pl) plus fr, de, ja, it, nl. Returns null when nothing matches.
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

/**
 * KEKE — Nigerian Cities Place Seed Data
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated places for every Nigerian city Keke operates in.
 * Organized by city slug, then by category.
 *
 * Each place has:
 *  - name: official/common name
 *  - aliases: alternative spellings, abbreviations, local nicknames
 *  - category: type of place
 *  - coordinates: [lng, lat] (GeoJSON order)
 *  - popularity: 1-10 initial score (affects search ranking)
 */

const CITY_PLACES = {

  // ════════════════════════════════════════════════════════════════════════════
  // ABAKALIKI — Ebonyi State (Keke's Launch City)
  // ════════════════════════════════════════════════════════════════════════════
  abakaliki: [
    // Universities
    { name: 'EBSU Main Gate',               aliases: ['ebonyi state university', 'ebsu gate', 'university gate'],
      category: 'university',   coords: [8.1101, 6.3197], popularity: 9 },
    { name: 'EBSU Parm Site',               aliases: ['parm site', 'ebsu parm', 'pharmacy site', 'parm'],
      category: 'university',   coords: [8.1089, 6.3220], popularity: 9 },
    { name: 'EBSU Faculty of Law',          aliases: ['law faculty', 'ebsu law'],
      category: 'university',   coords: [8.1095, 6.3205], popularity: 6 },
    { name: 'PRESCO Campus',                aliases: ['presco', 'ebsu presco', 'prestige'],
      category: 'university',   coords: [8.1112, 6.3189], popularity: 8 },
    { name: 'Federal University Ikwo',      aliases: ['funai', 'futo ikwo', 'federal university ndufu alike'],
      category: 'university',   coords: [8.1404, 6.1982], popularity: 7 },
    { name: 'School of Nursing Abakaliki',  aliases: ['nursing school', 'son'],
      category: 'school',       coords: [8.1145, 6.3244], popularity: 6 },

    // Markets
    { name: 'Kpirikpiri Market',            aliases: ['kpiri kpiri', 'kpirikpiri', 'main market abakaliki'],
      category: 'market',       coords: [8.1123, 6.3267], popularity: 10 },
    { name: 'Abakaliki Rice Mill',          aliases: ['rice mill', 'salt lake', 'ebonyi rice'],
      category: 'market',       coords: [8.1034, 6.3301], popularity: 9 },
    { name: 'Timber Shed Market',           aliases: ['timber shed', 'timber market'],
      category: 'market',       coords: [8.1078, 6.3350], popularity: 8 },
    { name: 'Mile 50 Market',              aliases: ['mile 50', 'fifty junction'],
      category: 'market',       coords: [8.1234, 6.3188], popularity: 9 },
    { name: 'Afikpo Road Market',           aliases: ['afikpo market', 'afikpo road'],
      category: 'market',       coords: [8.1156, 6.3400], popularity: 6 },

    // Junctions
    { name: 'Presco Junction',              aliases: ['presco junction', 'university junction'],
      category: 'junction',     coords: [8.1118, 6.3182], popularity: 10 },
    { name: 'Spera In Deo Junction',        aliases: ['spera in deo', 'spera', 'SID junction'],
      category: 'junction',     coords: [8.1067, 6.3290], popularity: 9 },
    { name: 'Kpirikpiri Junction',          aliases: ['kpiri junction', 'market junction'],
      category: 'junction',     coords: [8.1120, 6.3270], popularity: 9 },
    { name: 'Waterworks Junction',          aliases: ['waterworks', 'water works'],
      category: 'junction',     coords: [8.1089, 6.3355], popularity: 8 },
    { name: 'Old Government House Junction', aliases: ['old gov house', 'GH junction'],
      category: 'junction',     coords: [8.1010, 6.3310], popularity: 7 },
    { name: 'Abakaliki Township Stadium',   aliases: ['stadium', 'ebonyi stadium'],
      category: 'landmark',     coords: [8.1089, 6.3280], popularity: 7 },

    // Hospitals
    { name: 'Federal Medical Centre Abakaliki', aliases: ['FMC', 'federal medical centre', 'FMC abakaliki'],
      category: 'hospital',     coords: [8.1145, 6.3301], popularity: 9 },
    { name: 'EBSUTH Teaching Hospital',     aliases: ['EBSUTH', 'ebonyi state university teaching hospital', 'teaching hospital'],
      category: 'hospital',     coords: [8.1132, 6.3318], popularity: 9 },

    // Government
    { name: 'Government House Abakaliki',   aliases: ['gov house', 'government house', 'ebonyi gov house'],
      category: 'government',   coords: [8.1002, 6.3315], popularity: 8 },
    { name: 'Ebonyi State Secretariat',     aliases: ['secretariat', 'state secretariat'],
      category: 'government',   coords: [8.1018, 6.3322], popularity: 7 },

    // Transport
    { name: 'Abakaliki Motor Park',         aliases: ['motor park', 'main park', 'abakaliki park'],
      category: 'transport',    coords: [8.1123, 6.3366], popularity: 10 },
    { name: 'Mile 50 Park',                aliases: ['fifty park', 'mile 50 motor park'],
      category: 'transport',    coords: [8.1240, 6.3190], popularity: 8 },
    { name: 'Enugu Road Park',             aliases: ['enugu park', 'enugu road bus stop'],
      category: 'transport',    coords: [8.1090, 6.3380], popularity: 7 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ENUGU — Enugu State
  // ════════════════════════════════════════════════════════════════════════════
  enugu: [
    { name: 'University of Nigeria Enugu Campus', aliases: ['unec', 'UNN enugu', 'university of nigeria'],
      category: 'university',   coords: [7.4943, 6.4295], popularity: 10 },
    { name: 'Enugu State University',       aliases: ['esut', 'state university enugu'],
      category: 'university',   coords: [7.5166, 6.4615], popularity: 9 },
    { name: 'Ogbete Main Market',           aliases: ['ogbete market', 'main market enugu', 'ogbete'],
      category: 'market',       coords: [7.5067, 6.4418], popularity: 10 },
    { name: 'Coal Camp',                    aliases: ['coal camp', 'coal camp junction'],
      category: 'junction',     coords: [7.5139, 6.4508], popularity: 9 },
    { name: 'Abakpa Nike',                  aliases: ['abakpa', 'abakpa junction', 'nike'],
      category: 'junction',     coords: [7.5522, 6.4743], popularity: 9 },
    { name: 'New Market Enugu',             aliases: ['new market', 'enugu new market'],
      category: 'market',       coords: [7.4988, 6.4351], popularity: 8 },
    { name: 'Independence Layout',          aliases: ['independence layout', 'independence'],
      category: 'area',         coords: [7.5215, 6.4320], popularity: 8 },
    { name: 'GRA Enugu',                   aliases: ['GRA', 'government reserved area enugu'],
      category: 'area',         coords: [7.5064, 6.4250], popularity: 8 },
    { name: 'Enugu Airport',               aliases: ['akanu ibiam airport', 'enugu international'],
      category: 'transport',    coords: [7.5620, 6.4743], popularity: 9 },
    { name: 'Enugu North Motor Park',      aliases: ['north park', 'enugu park', 'northern park'],
      category: 'transport',    coords: [7.4999, 6.4541], popularity: 9 },
    { name: 'UNTH Enugu',                  aliases: ['university of nigeria teaching hospital', 'UNTH'],
      category: 'hospital',     coords: [7.5032, 6.4281], popularity: 9 },
    { name: 'Enugu Government House',      aliases: ['enugu gov house', 'government house enugu'],
      category: 'government',   coords: [7.5011, 6.4378], popularity: 7 },
    { name: 'Artisan Market Enugu',        aliases: ['artisan market', 'artisan'],
      category: 'market',       coords: [7.5191, 6.4481], popularity: 7 },
    { name: 'Uwani',                       aliases: ['uwani junction', 'uwani bus stop'],
      category: 'area',         coords: [7.5100, 6.4400], popularity: 8 },
    { name: 'Trans Ekulu',                 aliases: ['trans ekulu junction', 'trans-ekulu'],
      category: 'area',         coords: [7.5498, 6.4390], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ONITSHA — Anambra State
  // ════════════════════════════════════════════════════════════════════════════
  onitsha: [
    { name: 'Onitsha Main Market',          aliases: ['otu onitsha', 'main market onitsha', 'onitsha market', 'otu'],
      category: 'market',       coords: [6.7904, 6.1401], popularity: 10 },
    { name: 'Upper Iweka',                  aliases: ['upper iweka', 'iweka', 'iweka road'],
      category: 'junction',     coords: [6.7867, 6.1556], popularity: 10 },
    { name: 'Bridge Head',                  aliases: ['onitsha bridge', 'bridgehead', 'niger bridge head'],
      category: 'junction',     coords: [6.7840, 6.1453], popularity: 10 },
    { name: 'Niger Bridge Onitsha',         aliases: ['niger bridge', 'the bridge'],
      category: 'landmark',     coords: [6.7824, 6.1462], popularity: 9 },
    { name: 'New Market Road',              aliases: ['new market rd onitsha', 'new market onitsha'],
      category: 'market',       coords: [6.7889, 6.1490], popularity: 9 },
    { name: 'Inland Town',                  aliases: ['inland town', 'onitsha inland'],
      category: 'area',         coords: [6.7950, 6.1600], popularity: 7 },
    { name: 'Fegge',                        aliases: ['fegge junction', 'fegge onitsha'],
      category: 'area',         coords: [6.7820, 6.1350], popularity: 8 },
    { name: 'Woliwo Junction',              aliases: ['woliwo', 'owerri road junction onitsha'],
      category: 'junction',     coords: [6.7945, 6.1280], popularity: 8 },
    { name: 'GRA Onitsha',                 aliases: ['GRA', 'government reserved area onitsha'],
      category: 'area',         coords: [6.8042, 6.1667], popularity: 7 },
    { name: 'Dennis Memorial Hospital',    aliases: ['dennis hospital', 'DMH'],
      category: 'hospital',     coords: [6.7867, 6.1535], popularity: 7 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // OWERRI — Imo State
  // ════════════════════════════════════════════════════════════════════════════
  owerri: [
    { name: 'Owerri Municipal Bus Station', aliases: ['owerri park', 'main park owerri', 'municipal park'],
      category: 'transport',    coords: [7.0333, 5.4836], popularity: 10 },
    { name: 'Imo State University',         aliases: ['imsu', 'state university owerri'],
      category: 'university',   coords: [7.0217, 5.4964], popularity: 10 },
    { name: 'Federal University of Technology Owerri', aliases: ['futo', 'federal university owerri'],
      category: 'university',   coords: [7.0102, 5.3818], popularity: 10 },
    { name: 'Relief Market Owerri',         aliases: ['relief market', 'owerri market', 'relief'],
      category: 'market',       coords: [7.0285, 5.4759], popularity: 9 },
    { name: 'Douglas Road',                aliases: ['douglas road junction', 'douglas'],
      category: 'junction',     coords: [7.0280, 5.4867], popularity: 9 },
    { name: 'Owerri GRA',                  aliases: ['GRA owerri', 'government reserved owerri'],
      category: 'area',         coords: [7.0485, 5.4822], popularity: 8 },
    { name: 'Obinze',                      aliases: ['obinze junction', 'obinze owerri'],
      category: 'area',         coords: [7.0648, 5.4455], popularity: 7 },
    { name: 'World Bank Housing Estate',   aliases: ['world bank', 'world bank estate owerri'],
      category: 'area',         coords: [7.0594, 5.5022], popularity: 8 },
    { name: 'FMC Owerri',                  aliases: ['federal medical centre owerri', 'FMC imo'],
      category: 'hospital',     coords: [7.0378, 5.4819], popularity: 8 },
    { name: 'Sam Mbakwe Airport',          aliases: ['owerri airport', 'sam mbakwe'],
      category: 'transport',    coords: [7.2020, 5.4279], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // AWKA — Anambra State
  // ════════════════════════════════════════════════════════════════════════════
  awka: [
    { name: 'Nnamdi Azikiwe University Awka', aliases: ['unizik', 'nau', 'zik university'],
      category: 'university',   coords: [7.0715, 6.2350], popularity: 10 },
    { name: 'Unizik Temporary Site',        aliases: ['temp site', 'unizik temp'],
      category: 'university',   coords: [7.0680, 6.2218], popularity: 9 },
    { name: 'Eke Awka Market',             aliases: ['eke awka', 'awka market', 'eke'],
      category: 'market',       coords: [7.0718, 6.2103], popularity: 9 },
    { name: 'Aroma Junction Awka',         aliases: ['aroma junction', 'aroma'],
      category: 'junction',     coords: [7.0762, 6.2215], popularity: 10 },
    { name: 'Amawbia',                     aliases: ['amawbia junction', 'awba'],
      category: 'area',         coords: [7.0648, 6.2010], popularity: 8 },
    { name: 'Ifite Awka',                  aliases: ['ifite road', 'ifite'],
      category: 'area',         coords: [7.0791, 6.2410], popularity: 8 },
    { name: 'Anambra State Secretariat',   aliases: ['state secretariat awka', 'awka secretariat'],
      category: 'government',   coords: [7.0782, 6.2133], popularity: 7 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // BENIN CITY — Edo State
  // ════════════════════════════════════════════════════════════════════════════
  'benin-city': [
    { name: 'University of Benin',          aliases: ['uniben', 'university of benin'],
      category: 'university',   coords: [5.6142, 6.3698], popularity: 10 },
    { name: 'Ring Road Benin',             aliases: ['ring road', 'benin ring road'],
      category: 'junction',     coords: [5.6124, 6.3350], popularity: 10 },
    { name: 'New Benin Market',            aliases: ['new benin market', 'main market benin'],
      category: 'market',       coords: [5.6235, 6.3450], popularity: 9 },
    { name: 'Oba Market Benin',            aliases: ['oba market', 'palace market'],
      category: 'market',       coords: [5.6233, 6.3424], popularity: 9 },
    { name: 'Uselu',                       aliases: ['uselu junction', 'uselu market'],
      category: 'area',         coords: [5.6438, 6.3760], popularity: 8 },
    { name: 'Sapele Road',                 aliases: ['sapele road junction', 'sapele rd'],
      category: 'junction',     coords: [5.6248, 6.3210], popularity: 9 },
    { name: 'Benin GRA',                   aliases: ['GRA benin', 'government reserved benin'],
      category: 'area',         coords: [5.6083, 6.3508], popularity: 8 },
    { name: 'University of Benin Teaching Hospital', aliases: ['UBTH', 'teaching hospital benin'],
      category: 'hospital',     coords: [5.6101, 6.3700], popularity: 9 },
    { name: 'Airport Road Benin',          aliases: ['airport road', 'benin airport road'],
      category: 'junction',     coords: [5.5990, 6.3178], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // PORT HARCOURT — Rivers State
  // ════════════════════════════════════════════════════════════════════════════
  'port-harcourt': [
    { name: 'University of Port Harcourt', aliases: ['uniport', 'university of ph'],
      category: 'university',   coords: [6.9039, 4.8979], popularity: 10 },
    { name: 'Rumuola Junction',            aliases: ['rumuola', 'rumuola bus stop'],
      category: 'junction',     coords: [6.9973, 4.8452], popularity: 9 },
    { name: 'Mile 1 Market Port Harcourt', aliases: ['mile 1', 'mile one ph', 'mile 1 ph'],
      category: 'market',       coords: [7.0029, 4.8402], popularity: 10 },
    { name: 'Mile 3 Market Port Harcourt', aliases: ['mile 3', 'mile three ph'],
      category: 'market',       coords: [7.0218, 4.8315], popularity: 9 },
    { name: 'Port Harcourt City Centre',   aliases: ['ph city', 'town ph', 'port harcourt town'],
      category: 'area',         coords: [7.0134, 4.8156], popularity: 9 },
    { name: 'GRA Phase 1 Port Harcourt',  aliases: ['GRA phase 1', 'old GRA ph'],
      category: 'area',         coords: [7.0209, 4.8069], popularity: 8 },
    { name: 'GRA Phase 2 Port Harcourt',  aliases: ['GRA phase 2', 'new GRA ph'],
      category: 'area',         coords: [7.0380, 4.7960], popularity: 8 },
    { name: 'Trans Amadi',                aliases: ['trans amadi industrial', 'trans-amadi'],
      category: 'area',         coords: [6.9822, 4.8300], popularity: 8 },
    { name: 'Rumuola Market',             aliases: ['rumuola market', 'ph rumuola'],
      category: 'market',       coords: [6.9990, 4.8460], popularity: 7 },
    { name: 'Port Harcourt International Airport', aliases: ['ph airport', 'omagwa airport'],
      category: 'transport',    coords: [6.9496, 4.7048], popularity: 9 },
    { name: 'UNIPORT Teaching Hospital',  aliases: ['UPTH', 'uniport hospital'],
      category: 'hospital',     coords: [6.9035, 4.8961], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // CALABAR — Cross River State
  // ════════════════════════════════════════════════════════════════════════════
  calabar: [
    { name: 'University of Calabar',       aliases: ['unical', 'university of calabar'],
      category: 'university',   coords: [8.3272, 4.9766], popularity: 10 },
    { name: 'Watt Market Calabar',         aliases: ['watt market', 'calabar market'],
      category: 'market',       coords: [8.3178, 4.9518], popularity: 10 },
    { name: 'Marian Market Calabar',       aliases: ['marian market'],
      category: 'market',       coords: [8.3298, 4.9448], popularity: 9 },
    { name: 'Calabar GRA',                aliases: ['GRA calabar'],
      category: 'area',         coords: [8.3413, 4.9700], popularity: 8 },
    { name: 'Calabar Municipal Council',  aliases: ['council calabar', 'CMC'],
      category: 'government',   coords: [8.3235, 4.9548], popularity: 7 },
    { name: 'Margaret Ekpo Airport',      aliases: ['calabar airport', 'margaret ekpo'],
      category: 'transport',    coords: [8.3520, 4.9762], popularity: 8 },
    { name: 'Tinapa Resort',              aliases: ['tinapa', 'tinapa business resort'],
      category: 'landmark',     coords: [8.2682, 4.9966], popularity: 8 },
    { name: 'University of Calabar Teaching Hospital', aliases: ['UCTH', 'calabar teaching hospital'],
      category: 'hospital',     coords: [8.3266, 4.9748], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // UYO — Akwa Ibom State
  // ════════════════════════════════════════════════════════════════════════════
  uyo: [
    { name: 'University of Uyo',           aliases: ['uniuyo', 'university of uyo'],
      category: 'university',   coords: [7.9128, 5.0377], popularity: 10 },
    { name: 'Ibom Plaza',                  aliases: ['ibom plaza', 'uyo plaza'],
      category: 'landmark',     coords: [7.9360, 5.0250], popularity: 9 },
    { name: 'Uyo Market',                  aliases: ['uyo main market', 'ika street market'],
      category: 'market',       coords: [7.9250, 5.0300], popularity: 9 },
    { name: 'Godswill Akpabio Stadium',    aliases: ['uyo stadium', 'akpabio stadium'],
      category: 'landmark',     coords: [7.9406, 5.0193], popularity: 8 },
    { name: 'Uyo GRA',                    aliases: ['GRA uyo'],
      category: 'area',         coords: [7.9250, 5.0450], popularity: 7 },
    { name: 'Victor Attah Airport',        aliases: ['uyo airport', 'victor attah'],
      category: 'transport',    coords: [7.9998, 5.0232], popularity: 9 },
    { name: 'UUTH Hospital',              aliases: ['university of uyo teaching hospital', 'UUTH'],
      category: 'hospital',     coords: [7.9290, 5.0390], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // NNEWI — Anambra State
  // ════════════════════════════════════════════════════════════════════════════
  nnewi: [
    { name: 'Nnamdi Azikiwe University Nnewi', aliases: ['NAUTH', 'nau nnewi', 'teaching hospital nnewi'],
      category: 'hospital',     coords: [6.9128, 6.0069], popularity: 9 },
    { name: 'Nnewi Main Market',           aliases: ['nnewi market', 'main market nnewi'],
      category: 'market',       coords: [6.9057, 6.0113], popularity: 10 },
    { name: 'Nnewi Spare Parts Market',   aliases: ['spare parts nnewi', 'auto parts nnewi'],
      category: 'market',       coords: [6.9044, 6.0089], popularity: 9 },
    { name: 'Otolo Junction Nnewi',       aliases: ['otolo', 'otolo junction'],
      category: 'junction',     coords: [6.9023, 6.0050], popularity: 8 },
    { name: 'Umudim Nnewi',               aliases: ['umudim', 'umudim nnewi'],
      category: 'area',         coords: [6.9156, 6.0112], popularity: 7 },
    { name: 'Innoson Vehicle Manufacturing', aliases: ['innoson', 'IVM', 'innoson motors'],
      category: 'landmark',     coords: [6.9200, 6.0200], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // WARRI — Delta State
  // ════════════════════════════════════════════════════════════════════════════
  warri: [
    { name: 'Delta State University Abraka', aliases: ['delsu abraka', 'delta state university'],
      category: 'university',   coords: [6.1093, 5.7563], popularity: 9 },
    { name: 'Warri Main Market',           aliases: ['warri market', 'main market warri'],
      category: 'market',       coords: [5.7537, 5.5157], popularity: 10 },
    { name: 'Effurun Roundabout',          aliases: ['effurun roundabout', 'effurun'],
      category: 'junction',     coords: [5.7755, 5.5423], popularity: 10 },
    { name: 'Airport Road Warri',          aliases: ['airport road warri'],
      category: 'junction',     coords: [5.7850, 5.5500], popularity: 8 },
    { name: 'PTI Junction Warri',          aliases: ['PTI junction', 'petroleum training institute'],
      category: 'junction',     coords: [5.7692, 5.5667], popularity: 8 },
    { name: 'Warri GRA',                  aliases: ['GRA warri', 'warri government reserved'],
      category: 'area',         coords: [5.7438, 5.5312], popularity: 7 },
    { name: 'Delta State Teaching Hospital', aliases: ['DSSH', 'central hospital warri', 'delta teaching hospital'],
      category: 'hospital',     coords: [5.7475, 5.5200], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ASABA — Delta State
  // ════════════════════════════════════════════════════════════════════════════
  asaba: [
    { name: 'Delta State University Asaba', aliases: ['delsu asaba', 'delsu'],
      category: 'university',   coords: [6.7333, 6.1963], popularity: 9 },
    { name: 'Asaba Main Market',           aliases: ['asaba market', 'major market asaba'],
      category: 'market',       coords: [6.7450, 6.1833], popularity: 9 },
    { name: 'Summit Road Asaba',           aliases: ['summit road', 'summit asaba'],
      category: 'area',         coords: [6.7289, 6.2042], popularity: 8 },
    { name: 'Infant Jesus Hospital',       aliases: ['infant jesus', 'infant jesus asaba'],
      category: 'hospital',     coords: [6.7378, 6.1906], popularity: 7 },
    { name: 'Asaba International Airport', aliases: ['asaba airport'],
      category: 'transport',    coords: [6.6683, 6.2030], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ABA — Abia State
  // ════════════════════════════════════════════════════════════════════════════
  aba: [
    { name: 'Aba Main Market',             aliases: ['aba market', 'ariaria market', 'ariaria'],
      category: 'market',       coords: [7.3462, 5.1153], popularity: 10 },
    { name: 'Ariaria International Market', aliases: ['ariaria international', 'international market aba'],
      category: 'market',       coords: [7.3530, 5.1200], popularity: 10 },
    { name: 'Aba Veneer Junction',         aliases: ['veneer junction', 'veneer'],
      category: 'junction',     coords: [7.3580, 5.1047], popularity: 8 },
    { name: 'Aba Central Business District', aliases: ['aba cbd', 'aba city centre'],
      category: 'area',         coords: [7.3673, 5.1085], popularity: 8 },
    { name: 'ABUTH Aba',                  aliases: ['abia teaching hospital', 'ABSUTH'],
      category: 'hospital',     coords: [7.3720, 5.1122], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // JOS — Plateau State
  // ════════════════════════════════════════════════════════════════════════════
  jos: [
    { name: 'University of Jos',           aliases: ['unijos', 'uniJos'],
      category: 'university',   coords: [8.8945, 9.9098], popularity: 10 },
    { name: 'Jos Main Market',             aliases: ['jos market', 'terminus market jos'],
      category: 'market',       coords: [8.8945, 9.8965], popularity: 10 },
    { name: 'Terminus Junction Jos',       aliases: ['terminus', 'terminus jos'],
      category: 'junction',     coords: [8.8902, 9.8978], popularity: 10 },
    { name: 'Rayfield Jos',               aliases: ['rayfield', 'rayfield area'],
      category: 'area',         coords: [8.9122, 9.8811], popularity: 7 },
    { name: 'Bassa Road',                  aliases: ['bassa road junction', 'bassa'],
      category: 'junction',     coords: [8.8745, 9.9198], popularity: 7 },
    { name: 'Jos University Teaching Hospital', aliases: ['JUTH', 'jos teaching hospital'],
      category: 'hospital',     coords: [8.8952, 9.9120], popularity: 8 },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // LAGOS — Lagos State
  // ════════════════════════════════════════════════════════════════════════════
  lagos: [
    // Universities
    { name: 'University of Lagos', aliases: ['unilag', 'akoka', 'university of lagos akoka'],
      category: 'university',   coords: [3.3898, 6.5158], popularity: 10 },
    { name: 'Lagos State University', aliases: ['lasu', 'lagos state university ojo'],
      category: 'university',   coords: [3.1897, 6.4662], popularity: 9 },
    { name: 'Yaba College of Technology', aliases: ['yabatech', 'yaba tech'],
      category: 'university',   coords: [3.3753, 6.5097], popularity: 9 },

    // Markets
    { name: 'Balogun Market', aliases: ['balogun', 'lagos island market'],
      category: 'market',       coords: [3.3946, 6.4531], popularity: 10 },
    { name: 'Oshodi Market', aliases: ['oshodi', 'oshodi market'],
      category: 'market',       coords: [3.3490, 6.5567], popularity: 9 },
    { name: 'Mile 12 Market', aliases: ['mile 12', 'mile twelve market'],
      category: 'market',       coords: [3.3880, 6.6031], popularity: 9 },
    { name: 'Alaba International Market', aliases: ['alaba', 'alaba market', 'alaba international'],
      category: 'market',       coords: [3.1808, 6.4472], popularity: 9 },
    { name: 'Computer Village Ikeja', aliases: ['computer village', 'ikeja computer village'],
      category: 'market',       coords: [3.3467, 6.5944], popularity: 9 },

    // Junctions & landmarks
    { name: 'Ojota Bus Stop', aliases: ['ojota', 'ojota junction'],
      category: 'junction',     coords: [3.3831, 6.5914], popularity: 9 },
    { name: 'Ikeja Along', aliases: ['ikeja along', 'along'],
      category: 'junction',     coords: [3.3167, 6.5833], popularity: 8 },
    { name: 'Oshodi Bus Terminal', aliases: ['oshodi terminal', 'oshodi bustop'],
      category: 'transport',    coords: [3.3490, 6.5567], popularity: 9 },
    { name: 'CMS Bus Stop', aliases: ['cms', 'christian mission society', 'cms lagos'],
      category: 'junction',     coords: [3.3947, 6.4541], popularity: 9 },
    { name: 'Lekki Phase 1', aliases: ['lekki phase 1', 'lekki 1'],
      category: 'junction',     coords: [3.4696, 6.4477], popularity: 8 },
    { name: 'Victoria Island', aliases: ['vi', 'victoria island lagos'],
      category: 'junction',     coords: [3.4219, 6.4281], popularity: 9 },
    { name: 'Ajah Bus Stop', aliases: ['ajah', 'ajah junction'],
      category: 'junction',     coords: [3.5653, 6.4676], popularity: 8 },

    // Hospitals
    { name: 'Lagos Island General Hospital', aliases: ['island general hospital', 'lagos general hospital'],
      category: 'hospital',     coords: [3.3947, 6.4537], popularity: 8 },
    { name: 'LUTH Teaching Hospital', aliases: ['luth', 'lagos university teaching hospital'],
      category: 'hospital',     coords: [3.3488, 6.5160], popularity: 9 },

    // Transport
    { name: 'Murtala Muhammed Airport', aliases: ['mma', 'lagos airport', 'muritala airport', 'international airport lagos'],
      category: 'transport',    coords: [3.3214, 6.5774], popularity: 10 },
    { name: 'Lagos Island Ferry Terminal', aliases: ['ferry terminal', 'lagos ferry'],
      category: 'transport',    coords: [3.3957, 6.4545], popularity: 8 },

    // Government
    { name: 'Lagos State Secretariat', aliases: ['secretariat ikeja', 'lagos secretariat'],
      category: 'government',   coords: [3.3428, 6.5958], popularity: 8 },
    { name: 'Alausa Secretariat', aliases: ['alausa', 'alausa ikeja'],
      category: 'government',   coords: [3.3500, 6.5969], popularity: 8 },
  ],

};

export { CITY_PLACES };

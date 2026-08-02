/* THE THIRD DAWN SAGA — DEFINITIVE ATLAS DATA
   World space: miles. Canvas world 9000 x 7000. Continent = ellipse
   center (4500,3500), a=3560, b=2680  →  area ≈ 29.97M sq mi (canon: 30M).
   Canon priority: March 2026 Retcon > Story Bible 8.0. Later session rulings
   (Suten Omrah Sunfire; Mor'kaleth offshore of the Western Ashlands;
   Void Queen's Swamp inside the Forest Ring with two mountains behind it;
   fishing village two days south of Sundisk by Sun Eater, one crystal, no recharge) supersede where they conflict. */

const WORLD = { w: 9000, h: 7000, cx: 4500, cy: 3500, a: 3560, b: 2680 };

const KINGDOMS = [
  { id:'heartlands', name:'Central Heartlands', capital:'Verdanthome', color:'#2e6b3f', border:'#57a86e',
    cx:4500, cy:3500, rx:800, ry:800, shape:'circle',
    pop:'3,000,000', territory:'800-mile radius from the World Tree (~2.0M sq mi)', age:'~3,000 years',
    ruler:'Theocratic council of seven druids',
    power:'Holds the World Tree and produces 60% of continental food. Absolute neutrality; the ATA is headquartered here. Controls the Crown Roads initiative — the highways to the Gates\u2019 airlines.',
    facts:'Three rings: Inner (elite), Middle (farmers), Outer (traders). Divine Flow Springs. Root City sits at the base of the World Tree.' },
  { id:'northern', name:'Northern Throne', capital:'Ironhaven', color:'#46536b', border:'#7d8db0',
    poly:[[3300,900],[4200,620],[5150,750],[5450,1250],[5100,1850],[4300,2050],[3550,1850],[3200,1350]],
    cap:[4450,1500], pop:'5,000,000', territory:'2.5M sq mi', age:'~500 years (youngest great kingdom)',
    ruler:'The Iron King', power:'Controls 60% of continental iron. Arms dealer to every kingdom. The Underkeep shelters 60% of the population underground through ten-month winters.',
    facts:'Crystal Lakes freeze ten months a year. Iron Cubs child-soldier program (45% survival). Secret alliance with the Eastern Jade Empire. Underground railroad helping children escape operates from here. Proud, warlike jarl culture of Germanic root: internal feuds are constant, and unification holds only under the Iron King\u2019s fist. Sixty percent of its people live underground \u2014 founded belief says the mountains protect them; the older cause walks across the ice each winter. [LOCKED]' },
  { id:'imperium', name:'Holy Imperium', capital:'Trinity Citadel', color:'#5b4a7d', border:'#8f7ab8',
    poly:[[5150,1550],[5900,1450],[6250,1850],[6050,2350],[5450,2500],[5100,2150]],
    cap:[5620,1950], pop:'7,000,000', territory:'1M sq mi', age:'~2,768 years',
    ruler:'Three Popes in eternal deadlock', power:'Controls religion across all kingdoms. Built where Seraphis was murdered; the Mourning Peaks\u2019 mist is said to be his weeping.',
    facts:'Living Saints (1% survival — suicide martyrs). Inquisitors screen all Gate travellers. Hunts true prophecy texts.' },
  { id:'zarkaine', name:'Zar\u2019kaine', capital:'Paradise Lost', color:'#3d3244', border:'#7a5f8a',
    poly:[[6250,850],[7100,780],[7620,1150],[7500,1700],[6800,1900],[6300,1500]],
    cap:[6542,1628], pop:'2,000,000', territory:'1.5M sq mi', age:'~8,000 years',
    ruler:'King Soren (unknowing Serathane vessel)',
    power:'The pariah kingdom. Volcanic basin hemmed between the Serpent\u2019s Spine and a polluted ocean — a natural prison. Gate embargo: exit only, for 500 years.',
    facts:'Pale, bald, red-eyed people; black-and-yellow cultural colours; extreme isolationism. Vampires under contract integrated in society. Non-human species exiled by the previous king. The Sulphur Coast\u2019s fish are mutated; the Barren Interior grows nothing.' },
  { id:'vaelthorne', name:'Vaelthorne Empire', capital:'Gladius Prime', color:'#7a2a24', border:'#c04a3a',
    poly:[[2450,1250],[3300,1050],[3700,1450],[3500,2100],[2800,2300],[2350,1850]],
    cap:[3050,1650], pop:'8,000,000', territory:'2M sq mi', age:'~1,500 years',
    ruler:'Military meritocracy — combat determines everything',
    power:'47 active volcanoes forge the continent\u2019s finest weapons. The Eternal Arena seats 100,000. Refuses all foreign infrastructure on principle.',
    facts:'Blood Forged child soldiers (25% survival). Cowards are denied Gate passage at the War Gate Terminal.' },
  { id:'ashlands', name:'Western Ashlands', capital:'Mournscar', color:'#4a4038', border:'#7d6f60',
    poly:[[1150,2550],[2100,2350],[2700,2750],[2650,3700],[2050,4150],[1300,3900],[1000,3200]],
    cap:[1950,3350], pop:'2,500,000', territory:'1.75M sq mi', age:'~9,500 years (oldest)',
    ruler:'None recognised — the Forsaken govern themselves',
    power:'Power through what it hides: 500,000 escaped child soldiers, outcasts and refugees live invisibly in the Borderland Marshes. Corrupted by Serathane\u2019s blood; the Blight expands yearly.',
    facts:'Poison rivers kill in minutes. Permanent grey sky. Forsaken Legion (15% survival). Kaelen was found here. Maps mark it empty; it is not. The Forest of the Forgetting stands in its interior over the inverted Tree of Knowledge; the Ashlands have lived beside an amnesia field since before any kingdom had a name, which is why the oldest people on the continent never once rose. [LOCKED]' },
  { id:'jade', name:'Eastern Jade Empire', capital:'Celestial City', color:'#1f5c40', border:'#3f9c6e',
    poly:[[6150,2500],[7250,2350],[7950,2900],[8000,3900],[7500,4650],[6600,4600],[6150,3700]],
    cap:[7050,3600], pop:'14,000,000 (largest)', territory:'3.75M sq mi', age:'~2,000 years',
    ruler:'Child Emperor Tianlong (age 9), puppet of the eunuch bureaucracy',
    power:'Controls the Three Great Rivers and continental water trade; rice feeds half the continent; total silk monopoly. The Jade Wall makes ground invasion a funnel through two river valleys — never fully conquered.',
    facts:'Jade Dragons use Divine Flow without stones (40% survival trial). Celestial City floats on the river. Exam system, eunuch rule, face before life.' },
  { id:'albion', name:'Albion Magna', capital:'Crownsburg-Upon-Sea', color:'#1e4d6b', border:'#3f85b0',
    poly:[[5450,4350],[6450,4300],[7050,4800],[6950,5500],[6100,5800],[5400,5400],[5250,4800]],
    cap:[6350,5150], pop:'12,000,000', territory:'3M sq mi', age:'~2,800 years (founded ~7,200 A.C.)',
    ruler:'The Crown — constitutional monarchy of merchants and admirals',
    power:'Naval supremacy — dependent on elven tolerance at the ocean Gates, a vulnerability its rivals covet. Turns infrastructure into debt leverage with Crown-denominated loans.',
    facts:'Victorian orderliness; class-segregated Gate lounges; extensive paperwork. Banking partnership with the Golden Coast.' },
  { id:'sunlands', name:'Southern Sunlands', capital:'Sundisk City', color:'#8a6a1c', border:'#d9b23a',
    poly:[[3050,4550],[4250,4400],[5250,4650],[5500,5450],[5150,6050],[4200,6250],[3300,6050],[2900,5350]],
    cap:[4350,5320], pop:'8,000,000', territory:'2.5M sq mi', age:'~3,500 years',
    ruler:'Suten Omrah Sunfire, Solaharan of the Nine Solanu',
    power:'Controls 85% of continental gold. Nine Solanu provinces under Sun Governors (Solahene). The Three-Zone Defense Model makes the desert itself the army: the Burning Shield, the Golden Corridors, the Sunheart.',
    facts:'Three underground rivers converge beneath Sundisk City. Salt traded weight-for-weight with gold. Tomorrow\u2019s Lions academy (35% survival). Sun Eaters (Ah-n\u00ede\u2019kra) invented by vassal Sol\u2019khari. Harmattan and haboob seasons charge the wind with Angel Stone dust.' },
];

/* Elven Forest Ring: annulus just inside the coast, 80% of perimeter, gap at Zar'kaine's Sulphur Coast (NE). */
const FOREST_RING = { inner:0.855, outer:0.965, gapStartDeg:15, gapEndDeg:85,
  name:'Elven Forest Ring', pop:'1,500,000 elves', width:'50\u2013200 miles',
  info:'Encircles ~80% of the continent. Hidden elven cities unmapped by humans. The elves control the ocean Gates through the Ring and levy passage; some Gates have been shut for centuries over grievances. The gap lies at Zar\u2019kaine\u2019s poisoned Sulphur Coast, where the Ring will not grow. Nine gated crossings, the Nine Thresholds, are the only sanctioned passages; control of the Thresholds is control of all coastal trade. [Nine Thresholds PROPOSED, July 2026]' };

const MOUNTAINS = [
  { id:'spine', name:'Spine of Heaven', path:[[5350,2350],[5420,2900],[5380,3500],[5300,4100],[5350,4600]],
    info:'North\u2013south central divide east of the World Tree. Peaks 30,000+ ft — God\u2019s Seat pierces the clouds. Divine Flow 200%. Dragon bones in the rock faces. Heaven\u2019s Gate Pass carries the trade route. \u201cFrom here, kingdoms are invisible. Only people are big.\u201d \u2014 Kaelen' },
  { id:'ironcrown', name:'Iron Crown Mountains', path:[[3500,1050],[4100,880],[4700,900],[5200,1050]],
    info:'The Northern Throne\u2019s treasury: 60% of continental iron. The Underkeep is dug beneath these roots.' },
  { id:'burning', name:'Burning Peaks', path:[[2550,1400],[2950,1250],[3350,1350],[3550,1700]],
    info:'Vaelthorne\u2019s volcanic forge-line. 47 active volcanoes; the sky glows at night above Gladius Prime.' },
  { id:'mourning', name:'Mourning Peaks', path:[[5150,2250],[5550,2380],[5950,2320],[6200,2200]],
    info:'Perpetual mist on the Imperium\u2019s border; sound carries strangely. Divine Flow fading since Seraphis\u2019s murder. \u201cThe mist is Seraphis weeping.\u201d' },
  { id:'jademts', name:'Jade Mountains', path:[[7350,2650],[7700,3000],[7850,3450]],
    info:'Source of precious jade and the monastery peaks where Divine Flow is taught.' },
  { id:'ashteeth', name:'The Ashteeth', path:[[3250,4480],[3900,4380],[4600,4360],[5200,4500]],
    info:'Low but treacherous — razor ridgelines, narrow defiles, rockslides. No army has crossed in formation. Forces Sunlands travellers east through the Glass Desert or west through the Ashlands corridor.' },
  { id:'serpent', name:'The Serpent\u2019s Spine', path:[[3450,1300],[4300,1180],[5200,1220],[5950,1150],[6500,1050],[7000,1000]],
    info:'Active volcanic chain from the Burning Peaks to Zar\u2019kaine, running behind the Imperium. Lava flows, sulphurous air, unstable ground. Zar\u2019kaine\u2019s prison wall.' },
  { id:'crownridge', name:'The Crown Ridge', path:[[3200,2520],[3900,2440],[4600,2430],[5250,2500]],
    info:'The continent\u2019s primary divide. High passes snowbound four months a year — northern invasions southward have a seasonal window.' },
  { id:'jadewall', name:'The Jade Wall', path:[[6180,2650],[6220,3200],[6200,3750],[6280,4300]],
    info:'Sheer, densely forested western rampart of the Jade Empire. Only two navigable river-valley approaches. Why the Empire has never fallen.' },
  { id:'sentinels', name:'The Two Sentinels', path:[[1430,4330],[1480,4460]],
    info:'Two great peaks standing behind the Void Queen\u2019s Swamp, between the swamp and the southwestern coast. The elves of the Ring will not name them. [PLACED PER RULING \u2014 July 2026]' },
];

const RIVERS = [
  { name:'First Great River', path:[[6350,2700],[6800,3050],[7300,3400],[7850,3620]] },
  { name:'Second Great River', path:[[6250,3400],[6800,3550],[7400,3620],[7850,3650]] },
  { name:'Third Great River', path:[[6350,4300],[6900,4000],[7450,3760],[7850,3680]] },
  { name:'Heartwater', path:[[4500,3500],[4900,2900],[5050,2300],[5000,1900]] },
  { name:'Southflow', path:[[4500,3500],[4300,4200],[4350,4900],[4350,5320]], underground:true,
    note:'One of three underground rivers converging beneath Sundisk City.' },
  { name:'Ashwash (poison)', path:[[2300,2700],[1900,3100],[1500,3500]], poison:true },
];

const SETTLEMENTS = [
  // capitals get type 'capital' and are drawn as stars
  { id:'verdanthome', name:'Verdanthome / Root City', x:4500, y:3500, type:'capital', kingdom:'heartlands',
    pop:'~2,000,000 (largest city)', info:'Grown around the base of the World Tree. Seat of the druid council and the ATA. World Tree Gate Terminal grown from living wood; all weapons surrendered, no exceptions.' },
  { id:'sundisk', name:'Sundisk City', x:4350, y:5320, type:'capital', kingdom:'sunlands',
    pop:'1,200,000', info:'Built where three underground rivers converge. Concentric rings: the Golden Circle (Palace, Great Sun Temple with ostrich-egg pinnacles, Noble Quarter), Middle Ring (Grand Market, Golden Gate Terminal), Outer Ring (Tomorrow\u2019s Lions Academy facing the Glass Desert).' },
  { id:'ironhaven', name:'Ironhaven', x:4450, y:1500, type:'capital', kingdom:'northern',
    pop:'~800,000', info:'Carved into the mountain. Irongate Terminal guarded by the giant statue of Thormund. \u201cBe good.\u201d' },
  { id:'trinity', name:'Trinity Citadel', x:5620, y:1950, type:'capital', kingdom:'imperium',
    pop:'~700,000', info:'Gothic cathedral-city on the site of Seraphis\u2019s murder. Trinity Terminal: mandatory blessing, tithes collected, heretics banned.' },
  { id:'gladius', name:'Gladius Prime', x:3050, y:1650, type:'capital', kingdom:'vaelthorne',
    pop:'~600,000', info:'Volcanic-stone capital around the Eternal Arena. War Gate Terminal: prove combat capability or be denied passage.' },
  { id:'mournscar', name:'Mournscar', x:1950, y:3350, type:'capital', kingdom:'ashlands',
    pop:'~200,000', info:'Half-ruined capital of the Forsaken. Named for Kaelen Mournscar — or he for it.' },
  { id:'celestial', name:'Celestial City', x:7050, y:3600, type:'capital', kingdom:'jade',
    pop:'~1,500,000', info:'Floats on the confluence of the Great Rivers. Lotus Terminal on an artificial lake — bow to the Emperor\u2019s portrait; detected assassins are executed on sight.' },
  { id:'crownsburg', name:'Crownsburg-Upon-Sea', x:6350, y:5150, type:'capital', kingdom:'albion',
    pop:'~1,100,000', info:'Victorian harbour capital. Crown Terminal in the dock district: orderly queues, tea service, first-class lounge for nobility.' },
  { id:'paradise', name:'Paradise Lost', x:6542, y:1628, type:'capital', kingdom:'zarkaine',
    pop:'~400,000', info:'Zar\u2019kaine\u2019s capital. Paradise Terminal under 500-year embargo — exit only. Children greet departing travellers with flowers; it is a recruitment tool.' },
  // vassals & towns
  { id:'fishing', name:'Rhy\u2019s Fishing Village', x:4451, y:6089, type:'village', kingdom:'sunlands',
    pop:'~500', info:'On the Wailing Cliffs coast, ~810 miles south of Sundisk City — two days by Sun Eater, weeks on foot. Wooden pirogues, drying nets, Captain Mensah\u2019s house, Nyla\u2019s tea house. \u201cMay your nets be full / may your hull be dry.\u201d The wind through the cliff formations wails; it masked a hidden prince\u2019s crying.' },
  { id:'goldencoast', name:'Golden Coast', x:5600, y:5450, type:'vassal', kingdom:'sunlands',
    pop:'150,000', info:'Merchant republic on the eastern coast; banking partnership with Albion Magna; busiest caravan route to Sundisk. Reached through the Golden Strait.' },
  { id:'drumharbor', name:'Drum Harbor', x:5150, y:5950, type:'vassal', kingdom:'sunlands',
    pop:'80,000', info:'Slave-trade hub — 100,000 sold yearly pass these docks. The darkest heart of the Sunlands\u2019 institutional evil.' },
  { id:'sunset', name:'Sunset Islands', x:4900, y:6560, type:'vassal', kingdom:'sunlands',
    pop:'60,000', info:'Three-island pirate confederation controlling the southern sea routes. Pays tribute to the Suten for legitimacy.' },
  { id:'taresh', name:'Oasis Kingdom of Taresh', x:3600, y:5750, type:'vassal', kingdom:'sunlands', pop:'40,000', info:'Southwestern oasis vassal.' },
  { id:'mirin', name:'Oasis Kingdom of Mirin', x:3350, y:5420, type:'vassal', kingdom:'sunlands', pop:'35,000', info:'Western oasis vassal near the Great Salt Flats.' },
  { id:'soleth', name:'Oasis Kingdom of Soleth', x:4900, y:5500, type:'vassal', kingdom:'sunlands', pop:'45,000', info:'Eastern oasis vassal on the Glass Desert\u2019s flank.' },
  { id:'veth', name:'Oasis Kingdom of Veth', x:4300, y:5800, type:'vassal', kingdom:'sunlands', pop:'30,000', info:'Southern oasis vassal on the Sundisk\u2013coast road.' },
  { id:'solkhari', name:'Sol\u2019khari', x:3900, y:5560, type:'vassal', kingdom:'sunlands',
    pop:'~90,000', info:'Vassal kingdom that invented the Sun Eater (Ah-n\u00ede\u2019kra). Its solar-flow workshops are the most guarded industrial secret on the continent.' },
  { id:'ironhold', name:'Ironhold', x:4000, y:1200, type:'vassal', kingdom:'northern', pop:'~60,000', info:'Northern Throne vassal fortress.' },
  { id:'wolfsburg', name:'Wolfsburg', x:4800, y:1250, type:'vassal', kingdom:'northern', pop:'~55,000', info:'Northern Throne vassal.' },
  { id:'glaciers', name:'Glacier\u2019s Edge', x:4400, y:950, type:'vassal', kingdom:'northern', pop:'~30,000', info:'Northernmost settlement before the inner ocean ice.' },
  { id:'thornwick', name:'Thornwick', x:4700, y:1800, type:'vassal', kingdom:'northern', pop:'~40,000', info:'Southern vassal of the Throne, below the Iron Crown.' },
  { id:'ironislands', name:'Iron Islands', x:5450, y:820, type:'vassal', kingdom:'northern', pop:'~50,000', info:'Offshore vassal chain in the Northern Frozen Sea.' },
  { id:'frostisles', name:'The Frost Isles', x:3600, y:640, type:'site', kingdom:null, pop:'Elven outposts',
    info:'Elven watch-islands monitoring the Northern Frozen Sea; ancient towers warn of threats from beyond.' },
  { id:'lotusbay', name:'Lotus Bay', x:7350, y:4350, type:'vassal', kingdom:'jade', pop:'~120,000', info:'Jade vassal port on the delta approaches.' },
  { id:'ashenkeep', name:'Ashen Keep', x:2100, y:3650, type:'town', kingdom:'ashlands',
    pop:'~40,000', info:'Half-ruined seat of the Bone Gate Terminal. No one enters or leaves at night; corruption screening mandatory; warnings in nine languages.' },
  { id:'saltflats', name:'The Great Salt Flats', x:3300, y:5250, type:'site', kingdom:'sunlands',
    pop:'Mining camps', info:'House Diallo\u2019s power base. Salt traded nearly weight-for-weight with gold; caravans of 500\u201312,000 camels carry it north and east.' },
  { id:'goldminesN', name:'Northern Gold Mines', x:4400, y:4780, type:'site', kingdom:'sunlands',
    pop:'50,000 slaves', info:'Richest deposits on the continent — 85% of continental gold. Underground rivers follow the veins.' },
  { id:'goldminesE', name:'Eastern Gold Mines', x:5050, y:4980, type:'site', kingdom:'sunlands', pop:'30,000 slaves', info:'Second mining complex of the Sunlands.' },
  { id:'sevenpalms', name:'Oasis of Seven Palms', x:4700, y:4700, type:'site', kingdom:'sunlands',
    pop:'Sahir\u2019ani waypoint', info:'Key desert waypoint controlled by the Sahir\u2019ani — the Spiral People, keepers of the destroyed Second World Tree, the \u201cbodyless phantoms\u201d official maps erase.' },
  { id:'merchantshaven', name:'Merchant\u2019s Haven', x:5950, y:4450, type:'town', kingdom:'albion',
    pop:'~200,000', info:'Free-trade city and money-laundering capital. Territory of the Banker, one of the Nine Shadows. [POSITION PROPOSED]' },
];

const GATES = [
  { id:'g_worldtree', name:'World Tree Terminal', x:4500, y:3470, kingdom:'heartlands', note:'ATA headquarters. Connects to all. Grown from living wood; absolute neutrality; all weapons surrendered.' },
  { id:'g_golden', name:'Golden Gate Terminal', x:4370, y:5300, kingdom:'sunlands', note:'Palace district, Sundisk City. Gold-plated everything. Heavy tariffs on non-citizens.' },
  { id:'g_iron', name:'Irongate Terminal', x:4460, y:1520, kingdom:'northern', note:'Carved into the mountain at Ironhaven. Weapons peace-bonded.' },
  { id:'g_lotus', name:'Lotus Terminal', x:7060, y:3620, kingdom:'jade', note:'Floating on an artificial lake. The most connected terminal on the continent.' },
  { id:'g_trinity', name:'Trinity Terminal', x:5630, y:1970, kingdom:'imperium', note:'Cathedral district. Mandatory blessing; tithes; Inquisitor screening.' },
  { id:'g_war', name:'War Gate Terminal', x:3060, y:1670, kingdom:'vaelthorne', note:'Arena district, Gladius Prime. Prove combat capability to enter.' },
  { id:'g_crown', name:'Crown Terminal', x:6360, y:5130, kingdom:'albion', note:'Dock district, Crownsburg. Class-segregated lounges; extensive paperwork.' },
  { id:'g_bone', name:'Bone Gate Terminal', x:2110, y:3630, kingdom:'ashlands', note:'Ashen Keep, partially ruined. Closed at night; corruption screening.' },
  { id:'g_paradise', name:'Paradise Terminal', x:6555, y:1640, kingdom:'zarkaine', embargo:true, note:'EMBARGO — exit only, 500 years running. Only the Bone Gate keeps a restricted connection.' },
];

const WONDERS = [
  { id:'worldtree', name:'The World Tree', x:4500, y:3500, icon:'tree',
    info:'Three miles tall, a mile wide at the trunk — the last of three. One stood in Zar\u2019kaine\u2019s drowned forebear, one in the Western Ashlands; both destroyed. The axis of the world, and after the Book Three split, the literal centre of the globe.' },
  { id:'glass', name:'The Glass Desert', x:4900, y:5150, icon:'glass',
    info:'10,000 sq mi of sand fused to glass by Kaelen\u2019s Category 6 Light Stone, ~Year 7,000 A.C. — twenty Hiroshimas at once, a deliberate judgment that ended the Sunlands\u2019 third empire. 140\u00b0F at noon. The Shapes — frozen humanoid glass — move when you\u2019re not looking. The glass reflects souls: travellers see the dead army beneath their feet.' },
  { id:'godsseat', name:'God\u2019s Seat', x:5380, y:3200, icon:'peak',
    info:'Highest peak of the Spine of Heaven, 30,000+ ft. Heaven\u2019s Gate Pass beneath it carries the only central trade route.' },
  { id:'arena', name:'The Eternal Arena', x:3080, y:1620, icon:'arena',
    info:'Seats 100,000. Combat decides rank, marriage, law and succession in Vaelthorne.' },
  { id:'underkeep', name:'The Underkeep', x:4300, y:1350, icon:'under',
    info:'The Northern Throne\u2019s underground nation — 60% of the population winters here for ten months of the year.' },
  { id:'wailing', name:'The Wailing Cliffs', x:4200, y:6110, icon:'cliffs',
    info:'Southern coastline of the Sunlands. Wind through the formations wails; locals say it carries the souls of the Glass Desert\u2019s dead. Rhy\u2019s escape route — the wailing masked his crying.' },
  { id:'drowningpillars', name:'The Drowning Pillars', x:7550, y:820, icon:'pillars',
    info:'Submarine volcanoes off Zar\u2019kaine, jagged black towers 200+ ft above the waves. From the tallest, the elves\u2019 Circle of Silence is visible on the horizon — a reminder of what sleeps below.' },
  { id:'scar', name:'The Scar', x:6450, y:1750, icon:'scar',
    info:'Ground where the second World Tree stood before Serathane destroyed it. Nothing grows. Nothing ever will.' },
  { id:'crownroads', name:'The Crown Roads', x:4820, y:3080, icon:'road',
    info:'15,000 miles of indestructible ancient road, 30 ft wide — the highways of the poor, against the Gates\u2019 airlines of the rich.' },
  { id:'celestialw', name:'The Floating City', x:7020, y:3560, icon:'float',
    info:'Celestial City rides the confluence of the Three Great Rivers on hulls no living engineer understands.' },
];

WONDERS.push(
  { id:'locks', name:'The Ten Thousand Locks', x:6450, y:3300, icon:'road',
    info:'A canal staircase from before the Forgetting, still functioning, understood by no living engineer. The Jade Empire maintains it by ritual imitation of maintenance no one comprehends. [PROPOSED]' },
  { id:'barrows', name:'The Iron Barrow-Fields', x:4150, y:1700, icon:'under',
    info:'Grave-mounds of a greater age, still yielding pattern-welded blades no living smith can reproduce. The jarls rebury one blade in ten, to be safe. [PROPOSED]' },
  { id:'stones', name:'The Standing Stones of the First Tongue', x:4750, y:3850, icon:'scar',
    info:'Inscribed stones no living person can read: visited, venerated, and misexplained. The Forgetting rendered in granite. [PROPOSED]' },
  { id:'phlegraea', name:'The Phlegraean Gates', x:2600, y:1900, icon:'pillars',
    info:'A sulfurous oracle caldera on Vaelthorne\u2019s southern marches; legion commanders consult it before any campaign, and deny doing so. [PROPOSED]' },
  { id:'weepingwastes', name:'The Weeping Wastes', x:1500, y:3400, icon:'cliffs',
    info:'A chemically luminous marsh in the deep Ashlands, beautiful and lethal. The Dust-Kin chant-maps mark it: sing past, never through. [PROPOSED]' },
  { id:'bloomfields', name:'The Bloomfields', x:2200, y:2900, icon:'glass',
    info:'Meadows of mutant flora that should not be so lovely. Recolonization made visible: life returning to the wound, changed. [PROPOSED]' },
  { id:'weepingglacier', name:'The Weeping Glacier', x:5500, y:2300, icon:'peak',
    info:'A slowly retreating ice-shrine in the Mourning Peaks, kept by monks whose oldest hymns describe four pillars upholding heaven, sung as allegory by everyone including the monks. [PROPOSED \u2014 pending RECONCILE ruling]' },
  { id:'brimstone', name:'The Brimstone Cathedral', x:6900, y:1700, icon:'peak',
    info:'A natural sulfur-terrace formation held as Zar\u2019kaine\u2019s holiest site; the Steam-Priesthood reads the deep vents beneath it like scripture. [PROPOSED]' },
  { id:'painted', name:'The Painted Basin', x:7050, y:1700, icon:'glass',
    info:'Neon acid pools of yellow, orange and green where even the water is ambitious. Life thrives here anyway, in forms the rest of the continent would rather not discuss. The source of the black-and-gold banner colors. [PROPOSED]' },
  { id:'lighthouse', name:'The Sovereign Lighthouse', x:6723, y:5567, icon:'float',
    info:'A beacon from before the Forgetting whose light needs no fuel. The Admiralty charts every sea-lane by it and forbids asking how it burns. [PROPOSED]' }
);


/* ---- The Salt and the Unknown One: the temple on the western Crown Road
   (July 2026 lockdown). Nudged 11 mi along the road from the calibrated
   (3700,3455) so it sits ON the spur exactly where it crosses the
   Heartlands' 800-mile boundary. ---- */
WONDERS.push(
  { id:'unknowntemple', name:'The Temple of the Unknown One', x:3702, y:3444, icon:'circle',
    info:'A stone temple on the western Crown Road at the point where it enters the Central Heartlands, as old as the self-repairing roads themselves. Its walls are carved edge to edge with inscriptions no living person can read; the order that keeps it, the Unlettered, has no doctrine because the doctrine was in the writing. But the temple protects: harvests near it hold, sickness turns aside, children born in its shadow live. So they sweep the floors, wash the words they cannot read, and pray at a wall addressed to nobody. The temple is Aethu’s; the erasure is Serathane’s; Aethu answers anyway. [LOCKED — The Salt and the Unknown One, July 2026]' }
);

/* ---- ITEM 6: The Floating Isles of the World Engine.
   The landmass that hangs above the Veiled Vortex. `isles` are cluster
   offsets [dx,dy,r] from the anchor; the two largest carry mountain glyphs,
   and every one is drawn with a hard offset shadow on the water beneath it —
   the shadow is what sells the altitude. `sea:true` marks it as a wonder
   that legitimately stands over water, so __landCheck() exempts it. ---- */
/* [ITEM 4, this round: vortex + isles moved together to the southern ocean
   between the Sunlands and Albion Magna — vortex (5450,6760), cluster
   directly above at (5450,6620); the 140-mile vertical pairing preserved.] */
WONDERS.push(
  { id:'floatingisles', name:'The Floating Isles — Gate of the World Engine', x:5450, y:6620, icon:'float', sea:true,
    isles:[[-92,-26,52],[26,-58,60],[104,14,36],[-24,44,30],[68,66,24]],
    info:'Above the Veiled Vortex, shrouded inside a standing tornado and a permanent crown of cloud, hang the floating isles that hold the gate to the World Engine. Passage opens only at the stellar alignment, when the southern vortex turns as one wheel with its northern twin; the way beyond leads to the one dry, green place in the Ice Wall. The Engine opens only to those who surrender the will to dominate while retaining the will to serve. [Established prior sessions; rendering PROPOSED]' }
);

/* ---- The Celestial Circle: revelation site of Rhy and Ashran (July 2026) ---- */
WONDERS.push(
  { id:'celestialcircle', name:'The Celestial Circle', x:5290, y:3860, icon:'circle',
    info:'A ring of ancient standing stones on the Spine of Heaven\u2019s western shoulder, above the pilgrim road. Here the Circle burned with divine light and two were revealed before the world: Rhy Sunfire as the next Chosen One, and Ashran as the reincarnation of Aurelion. Pilgrims now walk the ring sunwise and leave nothing behind; the stones are said to remember who stands inside them. [Placement PROPOSED per ruling, July 2026; revelation event canon per author]' }
);

const LAKES = [
  { id:'hundredautumns', name:'The Lake of a Hundred Autumns', x:6900, y:3900, rx:120, ry:85,
    info:'The great crane lake of the Jade Empire, shrinking into a hundred smaller lakes each dry season as half a million birds arrive. An imperial edict bans fishing for a decade at a time; enforcement is a Xun-Wei duty and a smuggler\u2019s opportunity. [PROPOSED]' },
  { id:'deepmere', name:'Deepmere', x:4600, y:1150, rx:90, ry:55,
    info:'The northern lake that freezes solid ten months a year and becomes a winter road; the Volok Haulers drag longships across it between waterways. [PROPOSED]' },
  { id:'benedicta', name:'Lake Benedicta', x:5850, y:2050, rx:45, ry:30,
    info:'A sacred alpine tarn on the pilgrim roads; its bed is centuries of votive silver no one dares dive for. [PROPOSED]' },
  { id:'medwyn', name:'Lake Medwyn', x:4100, y:3750, rx:55, ry:40,
    info:'The votive lake of the Heartlands; offerings sink and are never retrieved, by law and by fear. [PROPOSED]' },
  { id:'verdigris', name:'Lake Verdigris', x:1900, y:2900, rx:50, ry:35, toxic:true,
    info:'A turquoise pool in the Ashlands no bird lands on. The Unburnt hold services on its shore and call it honest water. [PROPOSED]' },
  { id:'sulfyr', name:'Lake Sulfyr', x:6600, y:1670, rx:40, ry:24, toxic:true,
    info:'A hypersaline hot lake in the Sulfur Basin; the Ember-Farmers seed its margins with heat-loving cultures, the margin between hunger and famine. [PROPOSED]' },
  { id:'elenmir', name:'Lake Elenmir', x:2153, y:5267, rx:60, ry:40,
    info:'A mirror-lake hidden inside the Forest Ring\u2019s southwestern arc. Humans who have seen it disagree about its color. [PROPOSED]' },
  { id:'faros', name:'Faro\u2019s Mirror', x:3150, y:5150, rx:70, ry:42, seasonal:true,
    info:'A seasonal lake at the Salt Flats margin, filling in the Greening and vanishing in the Long Dust to leave harvestable salt: a surfacing arm of an underground river. [PROPOSED]' },
];

const MARSHES = [
  { id:'westfen', name:'The Westmarch Fen', x:3120, y:3420, rx:85, ry:60,
    info:'Reed-fen and black pools southwest of Westmarch, fed by Heartlands runoff with nowhere to go. The town cuts peat here, hunts eels here, and buries nothing here, on principle. [PROPOSED per RULING, July 2026]' },
];

const FORESTS = [
  { id:'jotunwood', name:'The Jotunwood', x:4300, y:1780, rx:250, ry:120,
    info:'The old-growth taiga of the Northern Throne; reindeer-kin winter beneath its lichen snow, and the jarls\u2019 law ends at its eaves. [PROPOSED]' },
  { id:'whisperwood', name:'The Whisperwood', x:4850, y:3150, rx:140, ry:95,
    info:'An old-growth sacred grove of the Heartlands where the Bough-Wards keep the territorial trees; a felled ward-tree is an act of war answerable at the Grove-Moot. [PROPOSED] [RECONCILE note: read as a named grove within the greater Wardwood.]' },
];


/* ---- Iteration 3 forests: dark woods and the Elderlight (July 2026).
   kind:'dark' renders colder greens with sparse pale trunks;
   kind:'enchanted' gets a faint shimmer in the Painted style. ---- */
FORESTS.push(
  { id:'gloamwood', name:'The Gloamwood', x:3550, y:1750, rx:160, ry:90, kind:'dark',
    info:'Dark forest between Vaelthorne and the Northern marches; the legions burned it twice and it is wider now than before either fire. [PROPOSED] [RECONCILE note: read as Vargholt’s burned southern arm.]' },
  { id:'hungrypines', name:'The Hungry Pines', x:5100, y:1950, rx:140, ry:80, kind:'dark',
    info:'A cold arm of taiga south of the Jotunwood where travelers count their party at every rest, out of habit they cannot name. [PROPOSED]' },
  { id:'elderlight', name:'The Elderlight Grove', x:5250, y:3150, rx:100, ry:70, kind:'enchanted',
    info:'An enchanted grove on the Heartlands\u2019 eastern approaches where Divine Flow pools like morning light; the Bough-Wards permit passage and forbid harvest. [PROPOSED]' },
  { id:'weepingcedars', name:'The Weeping Cedars', x:5950, y:2350, rx:110, ry:70, kind:'dark',
    info:'Mist-fed cedar dark on the Imperium\u2019s alpine slopes; pilgrim roads bend around it, and the Grey Ledger keeps a file on why. [PROPOSED]' },
  { id:'jadecanes', name:'The Jade Canes', x:6350, y:3300, rx:120, ry:80, kind:'forest',
    info:'A bamboo sea on the Jade Empire\u2019s western terraces, harvested on imperial license and haunted by exactly one tiger, according to every village in it. [PROPOSED]' },
  { id:'thornwild', name:'The Thornwild', x:6250, y:4250, rx:100, ry:65, kind:'dark',
    info:'Briar-choked dark forest in the Albion\u2013Jade corridor; Merchant\u2019s Haven pays the free towns to keep its one road cut. [PROPOSED]' },
  { id:'palewood', name:'The Palewood', x:4450, y:2450, rx:90, ry:60, kind:'dark',
    info:'Haunted birch stand in the northern corridor; white bark, black knots, and a local custom of whistling through it that nobody breaks first. [PROPOSED]' }
);

/* ---- The Unhealed: the four canon scars (July 2026 lockdown).
   The four places the world never finished healing after the Dark Ages.
   Distinct from the Elven Forest Ring.
   kind:'grey' renders desaturated grey-green with a pale mist stipple in
   the Painted style — the Forgetting must read wrong, not lush.
   `hole` carves a clear annulus centre (the Wardwood rings the World Tree,
   so Verdanthome and Root City stay legible inside it). ---- */
FORESTS.push(
  { id:'forgetting', name:'The Forest of the Forgetting', x:1800, y:3250, rx:160, ry:105, kind:'grey',
    info:'The forest that grew over the inverted Tree of Knowledge, where Serathane rammed the drained tree into the earth and poured himself in. The pulse that took the world’s memory went out from here, and the ground has never stopped leaking: cross the treeline and by nightfall you cannot say who lit your fire. The only armor is knowing thyself. Ashlands folk call it the Grey Miles; the druids of the Wardwood call it the Orchard, and nobody outside the order understands the joke. This is why the Ashlands never rose: they have lived beside an amnesia field since before any kingdom had a name. [LOCKED — The Unhealed, July 2026]' },
  { id:'vargholt', name:'Vargholt', x:3450, y:1290, rx:200, ry:110, kind:'dark',
    info:'The great cold wood of the northern wilds between the Northern Throne and the Vaelthorne highlands, where the Flow never came all the way back. The folk who live in it are descendants of the communities that stayed on the surface through the Dark Ages: they change with the moon, they have villages and a language cousin to Northern speech, and there is no curse and no cure because there is nothing to cure. The Northern Throne has hunted them as vermin for five centuries. [LOCKED — The Unhealed. Placement note: the Gloamwood to its south is read as Vargholt’s burned southern arm — RECONCILE pending ruling]' },
  { id:'widowwood', name:'The Widow Wood', x:5500, y:4300, rx:110, ry:75, kind:'dark',
    info:'A normal-looking wood on the overland route between Albion Magna and the Heartlands, named by the villages on its edge for what happens to the wives of men who go in. There is no mist and no gate. Men walk in on purpose, to see their aunt. [LOCKED — The Unhealed]' },
  { id:'wardwood', name:'The Wardwood', x:4450, y:3400, rx:230, ry:155, kind:'forest', hole:{ x:4500, y:3500, r:70 },
    info:'The druidic woodland of the Central Heartlands, ringing the surviving Tree of Life. The druids are not pacifists; they are a watch: they tend the last standing tree, keep the record of what lies under the Ashlands, and hold the only reliable knowledge of how to enter the Forgetting and come out. Three empires walked across them and never asked what the wardens were warding. Wardwood timber is the only hull that reaches the far shore, and the druids give it, never sell it, and decide who receives it. [LOCKED — The Unhealed. RECONCILE note: the Whisperwood is read as a named grove WITHIN the Wardwood]' }
);

/* ---- Iteration 3 rivers: free-corridor water (July 2026) ---- */
RIVERS.push(
  { name:'The Waywater', path:[[5350,2900],[5600,3200],[5700,3300],[5850,3700],[5900,3900]] },
  { name:'The Coldrun', path:[[4650,2350],[4600,1900],[4600,1500],[4600,1150]] },
  { name:'The Marchflow', path:[[3550,3100],[3300,3300],[3120,3420]] },
  { name:'The Reachwash', path:[[3450,4200],[3100,4500],[2800,4800],[2600,5000]], seasonal:true,
    note:'Red Reaches dry-wash: a full stream in the Greening, a dashed memory of one in the Long Dust \u2014 and a flash-flood killer in between. [PROPOSED]' },
  { name:'The Fairburn', path:[[5600,4000],[5650,4200],[5750,4500]] }
);

/* ---- Iteration 3 lakes (July 2026) ---- */
LAKES.push(
  { id:'mistmere', name:'Mistmere', x:5500, y:3450, rx:45, ry:32,
    info:'Corridor lake between the Heartlands and the Jade Wall; Waymeet\u2019s water and Pilgrim\u2019s Rest\u2019s mirror. [PROPOSED]' },
  { id:'thaneswater', name:'Thane\u2019s Water', x:4950, y:2350, rx:40, ry:28,
    info:'Cold lake of the northern corridor, held in common by Thanesford and Coldwater under an oath older than either. [PROPOSED]' }
);

/* Seasonal systems data (for the seasonal map layers; see Claude Code handoff spec) */
const SEASONS = {
  sahel:{ zone:'sunlands', seasons:['The Greening','The Long Dust'],
    movements:[{what:'Herd transhumance (cattle, camels)', when:'onset of the Long Dust', dir:'south to floodplain margins, north at first rain'}],
    human:'Caravans in the cool months; salt camps active only in the Dust; herd-route congresses.' },
  monsoon:{ zone:'jade', seasons:['The Plum Rains','The Clear Cold'],
    movements:[{what:'Glass-eels', when:'late winter', dir:'upriver'},{what:'Silver eels', when:'autumn', dir:'downriver to sea'},
      {what:'Salmon-kin', when:'late summer + mid-autumn', dir:'upstream'},{what:'Cranes and geese', when:'autumn arrival, spring departure', dir:'to the Lake of a Hundred Autumns'}],
    human:'Heron-Boat nets; drawdown sluices; crane festivals; the decade fishing ban.' },
  taiga:{ zone:'northern', seasons:['Eight-part calendar'],
    movements:[{what:'Reindeer-kin', when:'spring up, autumn down', dir:'winter taiga lichen to summer high pasture, up to 400 miles'}],
    human:'Corrals at bottlenecks; calf-marking; the Great Thing in summer; frozen lakes as winter roads.' },
  maritime:{ zone:'albion', seasons:['The Whale-Spring','The Herring-Fall','The Gale-Dark'],
    movements:[{what:'Whale-kin', when:'summer north, winter south', dir:'feeding grounds to calving grounds'},
      {what:'Herring', when:'stock-specific runs', dir:'the Herring Road'},{what:'Seabirds', when:'spring to late summer', dir:'the Gannet Stacks'}],
    human:'Whaling fleets; herring fleets; egg-harvest taboos; victualling on the seasonal clock.' },
  alpine:{ zone:'imperium', seasons:['The Ascent','The High Summer','The Descent','The Deep Snow'],
    movements:[{what:'Ibex-kin, deer-kin', when:'spring up, first snow down', dir:'altitude migration'},
      {what:'Livestock transhumance', when:'late spring up, autumn down', dir:'valley to high pasture'}],
    human:'Charterhouse cheese-and-tithe; the Descent festival, garlands only for herds without loss; pilgrim traffic in the snow-free window.' },
  volcanic:{ zone:'ashlands+zarkaine', seasons:['The Quiet','The Bloom','The Ashfall'],
    movements:[{what:'Recolonization pulses', when:'after each event', dir:'inward from the edges'},
      {what:'Extremophile blooms', when:'on the vent cycle', dir:'the Sulfur Basin margins'}],
    human:'Salvage runs in the Quiet; chant-map revisions after Ashfall; vent-priest forecasts.' },
};


/* ---- Iteration 3 settlements: Ashlands, Vaelthorne, Jade, Albion (July 2026) ---- */
SETTLEMENTS.push(
  // Western Ashlands (+5)
  { id:'sorrowsgate', name:'Sorrow\u2019s Gate', x:2450, y:3050, type:'town', kingdom:'ashlands', pop:'~30,000',
    info:'The eastern checkpoint town where refugees enter the Ashlands. Everyone who governs it once walked through it the other way. [PROPOSED]' },
  { id:'hollowharbor', name:'Hollowharbor', x:1150, y:2900, type:'village', kingdom:'ashlands', pop:'~12,000',
    info:'Salvage port on the poison coast; its divers work the drowned approaches in waxed leathers and short shifts. [PROPOSED]' },
  { id:'ninefires', name:'The Nine Fires', x:1700, y:3550, type:'town', kingdom:'ashlands', pop:'~20,000',
    info:'A commune named for nine bonfires that have never been allowed to die: beacons for anyone still walking. Feeding them is the tax; tending them is the honor. [PROPOSED]' },
  { id:'greywatch', name:'Greywatch', x:2200, y:2600, type:'village', kingdom:'ashlands', pop:'~8,000',
    info:'Watchtower village on the Blight\u2019s creeping edge, measuring its advance in fence-posts per year. [PROPOSED]' },
  { id:'foundlingshollow', name:'Foundling\u2019s Hollow', x:1550, y:3800, type:'village', kingdom:'ashlands', pop:'~5,000',
    info:'A village that takes in abandoned children, no questions, no records. The Broken Chain knows the road here; so does the Underground Railroad. [PROPOSED]' },
  // Vaelthorne (+4)
  { id:'castraferrum', name:'Castra Ferrum', x:3400, y:1600, type:'town', kingdom:'vaelthorne', pop:'~40,000',
    info:'Legion fortress-town on the eastern marches; its walls are drilled as often as its soldiers. [PROPOSED]' },
  { id:'ludusmagna', name:'Ludus Magna', x:2900, y:1900, type:'town', kingdom:'vaelthorne', pop:'~60,000',
    info:'The great gladiator training city feeding the Arena-Cursus; freedmen leave through one gate, the fallen through another. [PROPOSED]' },
  { id:'ashvine', name:'The Ashvine Terraces', x:2650, y:1700, type:'village', kingdom:'vaelthorne', pop:'~25,000',
    info:'Vineyard town on volcanic slopes; the ash-wine of its terraces is drunk at every triumph and most funerals. [PROPOSED]' },
  { id:'tribunesgate', name:'Tribune\u2019s Gate', x:3350, y:2050, type:'town', kingdom:'vaelthorne', pop:'~35,000',
    info:'Mustering town of the Auxilia of the Ash-Provinces, where twenty-five-year terms begin with an oath and end with citizenship. [PROPOSED]' },
  // Eastern Jade (+3)
  { id:'pearlwell', name:'Pearl-Well', x:7100, y:4350, type:'town', kingdom:'jade', pop:'~70,000',
    info:'River-pearl town of the southern delta; its diving families are taxed by the pearl and paid by the season. [PROPOSED]' },
  { id:'baihe', name:'Baihe Crossing', x:6700, y:3450, type:'town', kingdom:'jade', pop:'~100,000',
    info:'Grand junction of the canal network where the Ten Thousand Locks meet the Long River trade; the busiest water-crossroads on the continent. [PROPOSED]' },
  { id:'mistcliff', name:'Mistcliff Monastery', x:7550, y:3050, type:'village', kingdom:'jade', pop:'~15,000',
    info:'Mountain monastery town in the Jade range where Divine Flow is taught without stones; forty in a hundred survive the trial, and the rest are remembered on the cliff wall. [PROPOSED]' },
  // Albion Magna (+3)
  { id:'ironquay', name:'Ironquay', x:5900, y:4900, type:'town', kingdom:'albion', pop:'~90,000',
    info:'Industrial port where Northern iron becomes Albion cannon; the air tastes of coal-smoke and prize-money. [PROPOSED]' },
  { id:'foxglovegreen', name:'Foxglove Green', x:6600, y:4550, type:'village', kingdom:'albion', pop:'~40,000',
    info:'Inland market town of hedgerows and horse-fairs; genteel, gossiping, and richer than it dresses. [PROPOSED]' },
  { id:'admiraltypoint', name:'Admiralty Point', x:6650, y:5500, type:'town', kingdom:'albion', pop:'~30,000',
    info:'Naval academy town of the Nine Tides; midshipmen learn the Charter Run on chalkboards before they ever taste salt. [PROPOSED]' }
);

const HIDDEN = [
  { id:'voidswamp', name:'The Void Queen\u2019s Swamp', x:1500, y:4300, icon:'swamp', r:170,
    info:'90,000 sq mi of black water inside the Forest Ring\u2019s western arc, at the Western Ashlands\u2019 southern border, expanding one square mile a year. The Two Sentinels stand behind it, between the swamp and the sea. The elves ring it; nothing rings her. [Swamp inside the Ring, mountains behind it — RULING, July 2026]' },
  { id:'morkaleth', name:'Mor\u2019kaleth — The Drowned Crown', x:520, y:3700, icon:'sunken', r:230,
    info:'Serathane\u2019s pre-Cataclysm empire, sunk by God at Year 1 A.C. with 70% of humanity — every citizen bearing the Crown Mark that bound their will to his. Sky Barges, God-Killers, Soul Engines and the Spire of Ascension still lie on the seafloor. The technology that destroyed the elves\u2019 homeworld. [Offshore of the Western Ashlands — RULING, July 2026; the March retcon\u2019s \u201cadjacent to Zar\u2019kaine\u201d line is superseded: RECONCILE flag]' },
  { id:'circle1', name:'Circle of Silence — Kingdom Watch', x:520, y:3700, icon:'watchring', r:300, towers:7,
    info:'Seven elven watchtowers, 500 ft tall on artificial coral-anchored islands, ringing the sunken kingdom. Garrison 200 each; light-signal network; 50-mile detection. Ships that enter the forbidden water are never seen again. Sacred duty served in 100-year rotations.' },
  { id:'circle2', name:'Circle of Silence — Weapon Watch', x:640, y:4290, icon:'watchring', r:150, towers:5,
    info:'A second, tighter ring of watch-points around the Weapon — the tree-killing cannon, broken by the Second Chosen One and sunk by the elves, lying sealed on the ocean floor apart from the drowned city. [Second ring per RULING, July 2026; Weapon identified as the cannon: LOCKED]' },
  { id:'weapon', name:'The Weapon (the Tree-Killing Cannon)', x:640, y:4290, icon:'spire', r:40,
    info:'The sealed cannon that killed the second World Tree, broken by the Second Chosen One and sunk by the elves. The single most dangerous object beneath the waves — the reason the second Circle exists. [Weapon = the cannon: LOCKED, July 2026. The Spire of Ascension — the tower built to pierce Aethyria — remains a separate drowned structure among Mor\u2019kaleth\u2019s ruins.]' },
  { id:'marshes', name:'Borderland Marshes / Broken Chain settlements', x:2380, y:3950, icon:'camp',
    info:'500,000+ escaped child soldiers, outcasts and refugees, invisible on every official map. \u201cThose aren\u2019t real places,\u201d say the librarians. They are.' },
  { id:'ninesuff', name:'The Nine Sufferings', x:1600, y:2830, icon:'camp',
    info:'Hidden coalition refuge in the deep Ashlands where the enslaved and escaped gather — where Vaelrath, the Cold One, found his creed. [POSITION PROPOSED]' },
  { id:'portroyale', name:'Port Royale', x:1250, y:5050, icon:'pirate',
    info:'Pirate confederation and black-market capital, reached through the Smuggler\u2019s Gap. Seat of the Admiral of the Nine Shadows.' },
  { id:'railroad', name:'Underground Railroad (route hint)', x:4050, y:1900, icon:'rail',
    info:'Magnus\u2019s network — 10,000+ children saved through safe houses that appear on no map. This marker is a hint, not a location; the routes shift. [DELIBERATELY VAGUE]' },
  { id:'khael', name:'Khael\u2019morguul Ruins', x:4950, y:1150, icon:'ruin',
    info:'Sealed facilities of the vanished deep civilisation. Some Northern tunnels lead to imprisoned dimensions. [POSITION PROPOSED]' },
  { id:'shadow_sun', name:'The Sun Scorpion (Nine Shadows)', x:4050, y:5050, icon:'crime', info:'Gold theft, caravan robbery, slaving. Sunlands territory of the Shadow Congress.' },
  { id:'shadow_wolf', name:'The Iron Wolf (Nine Shadows)', x:4650, y:1400, icon:'crime', info:'Angel Stone smuggling and weapons through the Northern Under-Roads.' },
  { id:'shadow_spider', name:'The Silk Spider (Nine Shadows)', x:7150, y:3800, icon:'crime', info:'Opium, gambling, information. Jade territory of the Shadow Congress.' },
  { id:'shadow_ash', name:'The Ash Walker (Nine Shadows)', x:1800, y:3100, icon:'crime', info:'Darkened stones, forbidden knowledge, blood magic.' },
  { id:'grimlock', name:'Grimlock Cult Site', x:1750, y:4150, icon:'cult',
    info:'Wheel-and-serpent hieroglyph carved on hidden altars in the Void Queen\u2019s Swamp\u2019s shadow, where the cult worships what sleeps in the black water. [POSITION per RULING, July 2026]' },
];

/* ---- The Red Reaches: secret settlements (July 2026) ---- */
HIDDEN.push(
  { id:'sunkencamp', name:'The Sunken Camp', x:2700, y:4350, icon:'camp',
    info:'Bandit hideout in a collapsed canyon bowl, invisible until you are standing on its rim, at which point it is too late in both directions. [PROPOSED]' },
  { id:'desertersmesa', name:'Deserter\u2019s Mesa', x:3200, y:4550, icon:'camp',
    info:'A flat-top refuge of deserters from every army on the continent. One law: no flags. Not even in jest. Especially not in jest. [PROPOSED]' },
  { id:'redhollow', name:'Red Hollow', x:2500, y:4700, icon:'crime',
    info:'The robbers\u2019 bazaar of the Reaches, where everything stolen between the Ashlands and the Sunlands is resold with the serial numbers filed off the provenance. [PROPOSED]' },
  { id:'silentmesa', name:'The Silent Mesa \u2014 the Stone People', x:2950, y:4850, icon:'ruin',
    info:'Home ground of the Stone People, a hidden folk of the canyons who go still as standing rock when watched. Travelers argue whether it is discipline, magic, or something the Reaches did to them; the Stone People do not settle arguments. [PROPOSED \u2014 nature of the Stone People OPEN for ruling]' },
  { id:'vulturesshelf', name:'Vulture\u2019s Shelf', x:3350, y:4300, icon:'crime',
    info:'Raider eyrie on the canyon rim above the Ash Road; tolls are informal, refusals are brief. [PROPOSED]' }
);


/* ---- The Unhealed: hidden-world sites (July 2026 lockdown) ---- */
HIDDEN.push(
  { id:'undercroft', name:'The Old Cathedral — the Undercroft', x:5750, y:1900, icon:'cult',
    info:'A great deconsecrated cathedral in the Holy Imperium, its dedication struck from the rolls, built over a pit. The pit opens into a cave system running under most of the Imperium and out beneath the sea, and the vampire city that fills it is called the Undercroft: the Imperium named it before it forgot it had. Its people are the Signed, made by the same soul contract as the Void Queen’s Three — the aristocracy came from this population. At night, from the cathedral floor, you can hear a grand piano. [LOCKED — The Unhealed. The piano is never explained.]' },
  { id:'auntscottage', name:'The Aunt’s Cottage', x:5520, y:4330, icon:'cult',
    info:'The villages do not say her name; they say a man has gone to see his aunt, and everyone understands, and nobody stops him. She reads futures honestly and well, and her fee is your other name — the one the dead know you by. A person without a soul name does not die and does not leave. The animals around her cottage are the point. There are a great many of them, and some of them are very old. [LOCKED — The Unhealed; what she is remains OPEN]' },
  { id:'iceedge', name:'The Ice Edge — the Winter Crossing', x:4550, y:780, icon:'ruin',
    info:'When the northern ocean freezes, the sirens walk. They do not fly the crossing, and nobody knows why, and the walking is worse to watch. Hundreds of men die every winter; the Stone-Ears — children deafened in infancy by families honored for it — hold the line and cannot hear the war they are fighting. This, not the Vaelthorne, is why the North went underground. [LOCKED — The Unhealed]' }
);


/* The Red Reaches: badlands corridor between the Ashlands and the Sunlands.
   Canyon-and-mesa wasteland; the desert does not stop at borders. [PROPOSED, July 2026] */
const BADLANDS = { name:'The Red Reaches',
  poly:[[2550,3850],[2950,3800],[3350,4000],[3550,4350],[3500,4800],[3150,5000],[2800,5250],[2500,5100],[2300,4800],[2250,4300]],
  info:'Canyon country between the Western Ashlands and the Southern Sunlands: banded red rock, flat-topped mesas, dry washes that flood without warning. Bounded north and east by the free towns of Ashford, Twinwells, and Dunmoor; running south to the eaves of the Forest Ring. Neither kingdom claims it and both cross it, and the free towns on its rim pay no throne and fear the washes more than any king. [PROPOSED, boundaries per RULING July 2026]' };

/* Maelstroms, gyres, and the two vortices */
const MAELSTROMS = [
  { id:'m_sulphur', name:'The Sulphur Gyre', x:8050, y:750, r:60,
    info:'A permanent maelstrom in Zar\u2019kaine\u2019s poisoned northern ocean. Ships that fight it lose; the few Zar\u2019kaine pilots who ride its rim do not teach outsiders how. [PROPOSED]' },
  { id:'m_drowned', name:'The Drowned Wheel', x:8350, y:1650, r:70,
    info:'A slow, vast whirlpool east of the Sulphur Coast, turning like a millstone. Sailors say it grinds something under the water. Sailors are not wrong often enough for comfort. [PROPOSED]' },
  { id:'m_poison', name:'The Poison Gyre', x:420, y:2150, r:65,
    info:'A maelstrom of the Poison Sea, far north of the drowned kingdom. Its spray kills sails and skin alike; the Smuggler\u2019s Gap pilots swing wide around it. [PROPOSED]' },
  { id:'m_widow', name:'The Widow\u2019s Wheel', x:280, y:5100, r:60,
    info:'The southwestern maelstrom, kept at a respectful distance from the elven watch-waters. Port Royale wreckers fish its rim for what it spits back out. [PROPOSED]' },
  { id:'vortex_s', name:'The Veiled Vortex', x:5450, y:6760, r:110, vortex:true,
    info:'The great vortex of the southern ocean. Above it, shrouded inside an enormous standing tornado and a permanent crown of cloud, hang the floating islands that hold the gate to the God Engine. Passage is possible only when the stars align and the southern vortex connects to its northern twin. The way beyond leads to the one place in the Ice Wall that is dry land: green, dense, heavy, and holy. [Established prior session; atlas placement PROPOSED]' },
  { id:'vortex_n', name:'The Northern Vortex', x:5300, y:320, r:90, vortex:true,
    info:'The Veiled Vortex\u2019s twin in the Northern Frozen Sea. Dormant except at the alignment, when the two turn as one wheel and the passage opens. The Deep Watch ledger records it turning exactly four times in three centuries. [Established prior session; atlas placement PROPOSED]' },
];

/* ---- The white eel whirlpool behind the drowned kingdom (July 2026
   lockdown). Name is descriptive pending ruling. ---- */
MAELSTROMS.push(
  { id:'m_eelway', name:'The Drowned Kingdom Whirlpool', x:250, y:3200, r:55,
    info:'The whirlpool in the sea behind Serathane\u2019s drowned kingdom, beside the elven seal at Mor\u2019kaleth. It connects to others elsewhere, which is why white eels \u2014 the fish of the waters above the sunken kingdom \u2014 turn up, rarely and inexplicably, in seas thousands of miles away. Fishermen in four kingdoms have caught one in a lifetime and been called liars. [LOCKED \u2014 The Unhealed. OPEN: whether the whirlpools are a distinct phenomenon or old routes drowned and running unattended.]' }
);

/* ---- The two guardian whirlpools flanking the approach to the Last Fish
   (translated with the complex: same +2350,+1860 offset) ---- */
MAELSTROMS.push(
  { id:'m_fish_w', name:'Guardian Whirlpool \u2014 western gate', x:8300, y:2420, r:40,
    info:'Guardian whirlpool of the Last Fish ring. [PROPOSED]' },
  { id:'m_fish_e', name:'Guardian Whirlpool \u2014 eastern gate', x:8910, y:2400, r:40,
    info:'Guardian whirlpool of the Last Fish ring. [PROPOSED]' }
);

/* Straits through the Forest Ring & seas */
const SEAMARKS = [
  { name:'NORTHERN FROZEN SEA', x:4400, y:330, sea:true },
  { name:'POISON SEA', x:430, y:2600, sea:true, rot:-90 },
  { name:'EASTERN OCEAN', x:8600, y:3300, sea:true, rot:90 },
  { name:'SEA OF SORROWS', x:4600, y:6740, sea:true },
  { name:'The Iron Mouth', x:4400, y:830, strait:true, info:'Narrow, dangerous northern strait. Vikings navigate it expertly.' },
  { name:'The Dragon\u2019s Throat', x:7940, y:3650, strait:true, info:'Where the Three Great Rivers meet the sea. Heavily trafficked.' },
  { name:'The Golden Strait', x:5680, y:6080, strait:true, info:'Gold trade route. The elves tolerate the slave ships here — with disgust.' },
  { name:'The Smuggler\u2019s Gap', x:1060, y:4420, strait:true, info:'Unofficial passage. The elves look the other way. Port Royale access.' },
];

const ROUTES = [
  { name:'Crown Road: Root City\u2013Ironhaven', path:[[4500,3470],[4480,2800],[4450,2100],[4450,1520]], kind:'road' },
  { name:'Crown Road: Root City\u2013Sundisk', path:[[4500,3530],[4420,4200],[4380,4750],[4370,5300]], kind:'road' },
  { name:'Crown Road: Heaven\u2019s Gate Pass', path:[[4500,3500],[5000,3300],[5380,3210],[5900,3300],[6400,3450],[7050,3600]], kind:'road' },
  { name:'Crown Road: Root City\u2013Trinity', path:[[4500,3470],[5000,2900],[5400,2400],[5620,1970]], kind:'road' },
  { name:'Crown Road: western spur', path:[[4500,3500],[3800,3450],[3000,3400],[2100,3380]], kind:'road' },
  { name:'Caravan: Sundisk\u2013Golden Coast', path:[[4370,5320],[4900,5420],[5300,5440],[5600,5450]], kind:'caravan' },
  { name:'Caravan: Sundisk\u2013Salt Flats', path:[[4330,5320],[3900,5300],[3550,5270],[3300,5250]], kind:'caravan' },
  { name:'Caravan: Sundisk\u2013Veth\u2013Coast', path:[[4350,5350],[4310,5600],[4300,5800],[4380,5990],[4451,6089]], kind:'caravan' },
  { name:'Caravan: oasis loop', path:[[4350,5320],[3900,5560],[3600,5750]], kind:'caravan' },
  { name:'Sea lane: Crownsburg\u2013Golden Coast', path:[[6350,5200],[6000,5600],[5680,6060],[5600,5480]], kind:'sea' },
  { name:'Sea lane: Drum Harbor slave route', path:[[5150,5950],[4980,6300],[4900,6540]], kind:'sea' },
  { name:'River trade: the Three Rivers', path:[[6350,3400],[7000,3560],[7850,3650]], kind:'sea' },
  { name:'Smuggler\u2019s run: Port Royale', path:[[1250,5050],[1500,4700],[1900,4400],[2400,4250]], kind:'smuggle' },
  { name:'The Gold-and-Wool Road: Sundisk\u2013Crownsburg', path:[[4370,5320],[4800,5200],[5250,5100],[5700,5050],[6100,5100],[6350,5150]], kind:'caravan' },
  { name:'Caravan: Golden Coast\u2013Crownsburg overland', path:[[5600,5450],[5900,5300],[6100,5200],[6350,5150]], kind:'caravan' },
  { name:'The Incense Road: Celestial City\u2013Trinity', path:[[7050,3600],[6600,3200],[6200,2850],[6000,2900],[5900,2450],[5620,1970]], kind:'caravan' },
  { name:'The Quiet Road: Jade\u2013Ironhaven (via the border towns)', path:[[6500,2900],[5900,2600],[5450,2450],[5000,2450],[4700,2200],[4450,1520]], kind:'caravan' },
  { name:'The Ash Road: Mournscar\u2013Sundisk', path:[[1950,3350],[2450,3520],[2900,3700],[3050,4300],[3080,5060],[3260,5058],[3550,5270],[4330,5320]], kind:'caravan' },
  { name:'The Legion\u2019s Bargain: Gladius Prime\u2013Mournscar', path:[[3050,1650],[2800,2100],[2500,2500],[2100,2900],[1950,3350]], kind:'caravan' },
  { name:'Reluctant road: Gladius Prime\u2013Ironhaven', path:[[3050,1650],[3500,1500],[3700,1350],[4050,1550],[4450,1520]], kind:'caravan' },
  { name:'Reluctant road: Gladius Prime\u2013Root City', path:[[3050,1650],[3450,2000],[3900,2100],[4200,2250],[4400,2800],[4500,3470]], kind:'caravan' },
  { name:'Caravan: Trinity\u2013Ironhaven', path:[[5620,1970],[5400,1750],[5000,1700],[4700,1800],[4450,1520]], kind:'caravan' },
  { name:'Pilgrim Road of the Nine Shrines', path:[[5620,1970],[5750,2150],[5700,2700],[5600,3300],[5572,3462],[5450,3700],[5100,3950],[4700,3700],[4500,3530]], kind:'road' },
  { name:'The Wool Road: Root City\u2013Crownsburg', path:[[4500,3530],[5000,3900],[5450,4200],[5650,4400],[6000,4800],[6350,5150]], kind:'caravan' },
  { name:'Border link: Tollgreen\u2013Heron\u2019s Rest', path:[[5900,3900],[6400,4050],[6800,4200]], kind:'caravan' },
  { name:'Border link: Twinwells\u2013Ashford', path:[[3500,3900],[3200,3800],[2900,3700]], kind:'caravan' },
  { name:'Border link: Dunmoor\u2013Sundisk', path:[[3700,4200],[4000,4650],[4330,5320]], kind:'caravan' },
  { name:'The Charter Run (Albion island chain)', path:[[6350,5200],[6850,5500],[7150,5750],[7550,5580],[7820,5150],[7980,4720],[8180,4980]], kind:'sea' },
  { name:'The Silk Run: Crownsburg\u2013Dragon\u2019s Throat', path:[[6950,5450],[7500,4900],[7900,4300],[7940,3650]], kind:'sea' },
  /* 5.1: rerouted westward \u2014 the old leg through (8250,2500) ran straight
     through the Last Fish ring's guardian gates. The bow now hugs the corridor
     between the Jade coast bulge and the ring, 300+ mi clear of every
     seamount, gate whirlpool and isle. */
  { name:'The Iron Run: Dragon\u2019s Throat\u2013Iron Islands', path:[[7940,3650],[8320,3300],[8100,2750],[7940,2350],[7830,1500],[7000,700],[5900,650],[5450,820]], kind:'sea' },
  { name:'Sea lane: Iron Islands\u2013Iron Mouth', path:[[5450,820],[4900,760],[4400,830]], kind:'sea' },
  { name:'Sea lane: northern isles\u2013Iron Mouth', path:[[3300,760],[4000,800],[4400,830]], kind:'sea' },
  { name:'Sea lane: Liu-Chai\u2013Dragon\u2019s Throat', path:[[8500,4300],[8200,3900],[7940,3650]], kind:'sea' },
];

/* Cosmology (3D + reference) */
const COSMOS = {
  pillars: [
    { dir:'N', deg:90,  star:'red',    guardian:'The Northern Guardian — FALLEN. Defeated by Serathane; holds his pillar still, for the other side.' },
    { dir:'S', deg:270, star:'yellow', guardian:'Salem — the South Pillar, watcher of the Sunlands. The last loyal guardian.' },
    { dir:'E', deg:0,   star:'missing',guardian:'The Eastern Guardian — MISSING. Not even Salem knows what became of her. Her star is gone from above the pillar; the eastern wall is the weak section.' },
    { dir:'W', deg:180, star:'red',    guardian:'The Western Guardian — FALLEN. Defeated by Serathane; holds his pillar still, for the other side.' },
  ],
  wall:'The Ice Wall — the world-cage\u2019s rim. Carved faces line the wall the pillars stand on, their eyes glowing. The world believes itself a globe; the map it trusts was forged with everything else.',
  leviathans:'Three continent-sized leviathans swim the outer ocean — Aethu\u2019s dead-man\u2019s switch. If the Tree of Life dies, they wake and consume everything, Serathane included. Automatic. Impersonal. Uninvokable.',
  bowl:'The world is an oval in a bowl: an oval landmass in a bowl-shaped containment, braced by four metal pillars, walled in ice, ringed by an outer ocean. Structurally, a prison.',
};

/* ---- travel model ---- */
const TRAVEL = {
  modes: {
    foot:     { label:'On foot',   base:20 },
    mount:    { label:'Mounted (horse / Dahri)', base:40 },
    suneater: { label:'Sun Eater (Ah-n\u00ede\u2019kra)', base:405, range:810, rechargeDays:2 },
    gate:     { label:'Aetheric Gate', gate:true },
  },
  terrain: {
    plains:  { name:'plains',  foot:1.0,  mount:1.0,  suneater:1.0  },
    desert:  { name:'desert',  foot:0.6,  mount:0.62, suneater:0.95 },
    glass:   { name:'glass desert', foot:0.45, mount:0.5, suneater:0.85 },
    mountain:{ name:'mountains', foot:0.5, mount:0.45, suneater:0.5 },
    forest:  { name:'forest ring', foot:0.7, mount:0.6, suneater:0.7 },
    swamp:   { name:'swamp',   foot:0.4,  mount:0.35, suneater:0.6 },
    waste:   { name:'corrupted waste', foot:0.75, mount:0.75, suneater:0.9 },
    badlands:{ name:'badlands', foot:0.55, mount:0.5,  suneater:0.9 },
    snow:    { name:'snowfields', foot:0.65, mount:0.7, suneater:0.85 },
    water:   { name:'open water', foot:0.15, mount:0.15, suneater:0.3 },
  },
};


/* ---- irregular coastline (deterministic) ---- */
function coastNoise(theta){
  return 1
    + 0.038*Math.sin(3*theta+1.7)
    + 0.030*Math.sin(5*theta+4.1)
    + 0.022*Math.sin(8*theta+0.4)
    + 0.014*Math.sin(13*theta+2.9)
    + 0.009*Math.sin(21*theta+5.1);
}
function islandNoise(theta,seed){
  return 1
    + 0.16*Math.sin(2*theta+seed)
    + 0.11*Math.sin(3*theta+seed*2.3)
    + 0.07*Math.sin(5*theta+seed*4.7);
}

/* ---- islands: the shards of the drowned kingdom, and more ---- */
const ISLANDS = [
  { id:'lastlight', name:'Kaelen’s Sanctuary (Isle of Last Light)', x:8650, y:4550, rx:28, ry:18, seed:3.1, kind:'lush',
    info:'The eastern island Kaelen travels to and from across the Eastern Ocean \u2014 one town\u2019s footprint of land, alone in the deep water between the Albion and Jade arcs, some 770 miles off the nearest coast. Identified as his Sanctuary of Last Light: hundreds of near-extinct creatures \u2014 Nightfall the black pegasus, a raised dragon, one of the last unicorns \u2014 protected behind twelve thousand years of lethal privacy. \u201cI\u2019ve killed enough. Here, I save what I can.\u201d Known only to the Immortal Three and Nerathis; it appears on no in-world map. [Island position LOCKED per ruling \u2014 shrunk to a town\u2019s footprint and moved to the deep southeastern ocean, July 2026; sanctuary identification PROPOSED]' },
  { id:'ironisles', name:'Iron Islands', x:5450, y:790, rx:120, ry:70, seed:1.2, kind:'boreal',
    info:'Offshore vassal chain of the Northern Throne in the Northern Frozen Sea.' },
  { id:'frost1', name:'The Frost Isles', x:3600, y:640, rx:70, ry:48, seed:2.4, kind:'snow',
    info:'Elven watch-islands monitoring the Northern Frozen Sea; ancient towers warn of threats from beyond.' },
  { id:'frost2', name:'', x:3820, y:560, rx:42, ry:30, seed:5.0, kind:'snow', info:'Frost Isles \u2014 outer islet.' },
  { id:'sunset1', name:'Sunset Islands', x:4900, y:6560, rx:85, ry:56, seed:0.8, kind:'sand',
    info:'Three-island pirate confederation controlling the southern sea routes. Pays tribute to the Suten for legitimacy.' },
  { id:'sunset2', name:'', x:5090, y:6470, rx:55, ry:38, seed:2.9, kind:'sand', info:'Sunset Islands \u2014 middle isle.' },
  { id:'sunset3', name:'', x:4720, y:6640, rx:48, ry:34, seed:4.4, kind:'sand', info:'Sunset Islands \u2014 western isle.' },
  { id:'ember', name:'Ember Cays', x:4150, y:6540, rx:44, ry:28, seed:1.9, kind:'sand',
    info:'Low sand cays off the Wailing Cliffs; fishing fleets shelter here through haboob season. [POSITION PROPOSED]' },
  { id:'royale', name:'Port Royale Isle', x:1250, y:5050, rx:118, ry:80, seed:3.7, kind:'pirate',
    info:'Seat of the pirate confederation and the Admiral of the Nine Shadows, reached through the Smuggler\u2019s Gap.' },
  { id:'royale2', name:'', x:1450, y:5220, rx:40, ry:28, seed:0.5, kind:'pirate', info:'Port Royale \u2014 careening islet.' },
  { id:'shard_ne', name:'Crown Shards', x:7350, y:5350, rx:90, ry:58, seed:2.2, kind:'rock',
    info:'Archipelago off Albion Magna \u2014 broken pieces of Serathane\u2019s drowned paradise, left when his ancient kingdom sank in the hour of victory. The heroes will sail past its shards without knowing what they are looking at. [Shard-lore LOCKED; name PROPOSED]' },
  { id:'shard_ne2', name:'', x:7560, y:5180, rx:52, ry:36, seed:4.9, kind:'rock', info:'Crown Shards \u2014 outer shard.' },
  { id:'shard_ne3', name:'', x:7200, y:5560, rx:44, ry:30, seed:1.4, kind:'rock', info:'Crown Shards \u2014 southern shard.' },
  { id:'shard_w', name:'The Pale Shard', x:900, y:2350, rx:56, ry:38, seed:2.8, kind:'rock',
    info:'A lone shard of the drowned kingdom in the Poison Sea. Nothing nests here. [Name PROPOSED]' },
  { id:'shard_nw', name:'The Grey Shard', x:2350, y:1030, rx:48, ry:32, seed:0.9, kind:'rock',
    info:'Shard of the drowned kingdom off Vaelthorne\u2019s coast. Legion galleys give it a wide berth. [Name PROPOSED]' },
  { id:'shard_e', name:'The Broken Oar', x:8150, y:4550, rx:62, ry:40, seed:3.9, kind:'rock',
    info:'Shard of the drowned kingdom in the Eastern Ocean, named by Jade sailors for its silhouette. [Name PROPOSED]' },
  { id:'zhardei', name:'Zhar\u2019dei, the Sealed Quay', x:7500, y:1450, rx:32, ry:20, seed:2.0, kind:'rock',
    info:'A fan-shaped artificial trade island off the Sulphur Coast: Zar\u2019kaine\u2019s single sanctioned point of contact with the outside world, linked to the mainland by one guarded bridge. All trade and diplomacy is ritualized here; returning emigrants face execution. The Gate lets Zar\u2019kaine leave, the Quay lets the world approach, and neither lets anything mix. [PROPOSED]' },
  { id:'liuchai', name:'The Pearl Isles of Liu-Chai', x:8500, y:4300, rx:65, ry:42, seed:1.6, kind:'lush',
    info:'Maritime tributary of the Nine Lanterns astride the eastern trade; its pearl fleets pay the Pearl Threshold toll twice yearly. [PROPOSED]' },
  { id:'pr_s1', name:'', x:1040, y:4890, rx:30, ry:20, seed:0.7, kind:'pirate', info:'Port Royale outwork: gun-battery islet. The approach is a gauntlet by design. [PROPOSED]' },
  { id:'pr_s2', name:'', x:1430, y:4870, rx:28, ry:19, seed:1.8, kind:'pirate', info:'Port Royale outwork: chain-boom anchorage. [PROPOSED]' },
  { id:'pr_s3', name:'', x:1090, y:5260, rx:32, ry:22, seed:3.3, kind:'pirate', info:'Port Royale outwork: careening cove and lookout. [PROPOSED]' },
  { id:'pr_s4', name:'', x:1400, y:5240, rx:26, ry:18, seed:4.6, kind:'pirate', info:'Port Royale outwork: smugglers\u2019 cache islet. [PROPOSED]' },
  { id:'pr_s5', name:'', x:940, y:5090, rx:24, ry:16, seed:2.1, kind:'pirate', info:'Port Royale outwork: the western picket. [PROPOSED]' },
  { id:'skarnholm', name:'Skarnholm', x:4750, y:650, rx:55, ry:38, seed:0.9, kind:'boreal',
    info:'Northern jarl-isle in the Frozen Sea; its longships raid and trade in equal measure, and its jarl bows to Ironhaven only in summer. [PROPOSED]' },
  { id:'wolfteeth', name:'The Wolf Teeth', x:5150, y:580, rx:42, ry:30, seed:2.7, kind:'boreal',
    info:'Jagged isle chain guarding the eastern approach to the Iron Mouth; wreckers\u2019 fires burn on the skerries in the Gale-Dark. [PROPOSED]' },
  { id:'isbrand', name:'Isbrand', x:3300, y:760, rx:48, ry:34, seed:4.1, kind:'snow',
    info:'Ice-bound isle whose Berg-folk delvings run beneath the seabed; iron-tribute is paid in worked blades, never ore. [PROPOSED]' },
  { id:'hrafney', name:'Hrafney', x:2700, y:650, rx:40, ry:28, seed:1.3, kind:'boreal',
    info:'The raven isle, westernmost of the Northern holdings; its skald-hall keeps the oldest verses of the Skald-Reckoners. [PROPOSED]' },
  { id:'pyrrhos', name:'Pyrrhos Isle', x:2100, y:1150, rx:48, ry:32, seed:3.5, kind:'rock',
    info:'Volcanic isle off Vaelthorne\u2019s coast; the Vulcan Smith-Colleges keep a forge here that never cools. [PROPOSED]' },
  { id:'cindershoal', name:'The Cindershoal', x:2420, y:860, rx:38, ry:26, seed:0.4, kind:'rock',
    info:'Black-sand shoal isle where the legions run amphibious drills; ash from the Burning Peaks falls here like grey snow. [PROPOSED]' },
  { id:'griefrock', name:'The Grief Rock', x:760, y:3020, rx:46, ry:32, seed:2.9, kind:'rock',
    info:'Barren shard off the Ashlands coast where the Forsaken abandon their dead to the sea-wind. Nothing nests here either. [PROPOSED]' },
  { id:'mournholm', name:'Mournholm', x:920, y:4640, rx:44, ry:30, seed:4.8, kind:'rock',
    info:'Outcast isle south of the poison coast; a Broken Chain settlement clings to its lee shore, invisible on every official map. [PROPOSED]' },
  { id:'newalbany', name:'New Albany', x:7150, y:5750, rx:70, ry:46, seed:1.1, kind:'lush',
    info:'Crown colony and first pearl of the Chartered Isles; its governor outranks most mainland lords and never lets them forget it. [PROPOSED]' },
  { id:'kingsholm', name:'Kingsholm', x:7550, y:5580, rx:55, ry:38, seed:2.4, kind:'lush',
    info:'Chartered Isle: naval anchorage and prize-court where captured hulls are auctioned. [PROPOSED]' },
  { id:'portmeridian', name:'Port Meridian', x:7820, y:5150, rx:60, ry:40, seed:3.8, kind:'lush',
    info:'Chartered Isle: the eastern victualling station, last provisioning before the open ocean. [PROPOSED]' },
  { id:'charterholm', name:'Charterholm', x:7980, y:4720, rx:52, ry:34, seed:0.6, kind:'lush',
    info:'Chartered Isle: seat of the Chartered Companies\u2019 island courts, where quasi-sovereign writ runs under royal seal. [PROPOSED]' },
  { id:'gullswick', name:'Gullswick', x:7420, y:5950, rx:40, ry:28, seed:4.3, kind:'lush',
    info:'Chartered Isle: fishing colony and gull-egg harvest, taxed to the feather. [PROPOSED]' },
  { id:'ledgerrocks', name:'The Ledger Rocks', x:6850, y:6120, rx:36, ry:24, seed:1.9, kind:'rock',
    info:'Chartered islets named for the Threadneedle audit that ruined three governors; a debtors\u2019 garrison holds them now. [PROPOSED]' },
  { id:'sovereignsrest', name:'Sovereign\u2019s Rest', x:6550, y:6300, rx:44, ry:30, seed:3.2, kind:'lush',
    info:'Chartered Isle: the Crown\u2019s southern watering station on the Golden Strait run. [PROPOSED]' },
  { id:'tradewind', name:'Tradewind Isle', x:8180, y:4980, rx:46, ry:30, seed:0.2, kind:'lush',
    info:'Easternmost Chartered Isle, astride the Jade trade lanes; half its harbor fees are quietly split with the Silk Spider. [PROPOSED]' },
  { id:'pillar1', name:'', x:7520, y:830, rx:26, ry:18, seed:1.1, kind:'pillar', info:'The Drowning Pillars \u2014 submarine volcano.' },
  { id:'pillar2', name:'', x:7660, y:920, rx:20, ry:14, seed:2.6, kind:'pillar', info:'The Drowning Pillars \u2014 submarine volcano.' },
  { id:'pillar3', name:'', x:7430, y:960, rx:17, ry:12, seed:4.2, kind:'pillar', info:'The Drowning Pillars \u2014 submarine volcano.' },
];

/* ---- The Isle of the Last Fish, the Dying King's Isle (July 2026).
   A ring complex far out in the deep eastern ocean between Zar'kaine's arc
   and the Eastern Jade Empire's: the main isle, four outer isles, a broken
   ring of sea-mountains beyond them, and two guardian whirlpools flanking
   the approach. Its clouds are BLACK and drop sparks — deliberately NOT the
   Isle of the Last Door, whose clouds are red.
   [ITEM 1, this round: the whole complex translated as a unit by
   (+2350,+1860) from its first placement beside the Northern Throne. The
   calibrated target was (8600,2100); nudged 90 mi south so every isle and
   whirlpool clears the Drowned Wheel by 450+.] ---- */
/* [ITEM 1, this round: the isle turns GREEN. The dark treatment — volcanoes,
   black ground, spark-fall, dark haze, grey water — moves to the Land of the
   Dead; the Last Fish is a living isle. Ring arrangement, sea-rocks and the
   two guardian whirlpool gates stay.] */
ISLANDS.push(
  { id:'lastfish', name:'The Isle of the Last Fish', x:8600, y:2190, rx:110, ry:72, seed:3.9, kind:'lush',
    info:'The island where Kaelen came to the dying King of Kings, and shared with him a fish and a fruit. A green and living isle far out in the eastern ocean, ringed by its own small islands, by sea-rocks, and by two guardian whirlpools at its western and eastern gates. [Event canon per author; name and placement PROPOSED]' },
  { id:'lastfish_n', name:'', x:8600, y:2040, rx:38, ry:26, seed:1.15, kind:'lush',
    info:'Outer isle of the Last Fish ring. [PROPOSED]' },
  { id:'lastfish_e', name:'', x:8765, y:2190, rx:40, ry:27, seed:2.65, kind:'lush',
    info:'Outer isle of the Last Fish ring. [PROPOSED]' },
  { id:'lastfish_s', name:'', x:8600, y:2340, rx:44, ry:30, seed:4.05, kind:'lush',
    info:'Outer isle of the Last Fish ring. [PROPOSED]' },
  { id:'lastfish_w', name:'', x:8435, y:2190, rx:34, ry:22, seed:5.35, kind:'lush',
    info:'Outer isle of the Last Fish ring. [PROPOSED]' }
);

/* Sea-mountains: jagged seamount markers, not full islands. A broken ring,
   denser on the south-facing (front) arc, thinner at the sides and rear. */
const SEAMOUNT_RINGS = [
  /* hx/hy are hash anchors frozen at the ring's ORIGINAL centre, so the
     relocation is an exact translation: every peak keeps its jitter. */
  { id:'lastfish_ring', name:'The Sea-Mountains of the Last Fish', cx:8600, cy:2190, r:235, hx:6250, hy:330,
    info:'The ring of sea-mountains standing out of the grey water around the Isle of the Last Fish — thickest across its front, thinning at the sides, never quite closing behind. Hulls that clear the whirlpools still have to thread these. [PROPOSED, July 2026]' },
];
function seamountHash(a,b){ const h=Math.sin(a*127.1+b*311.7)*43758.5453; return h-Math.floor(h); }
/* Arcs in canvas degrees: 90 is due south (the front), 270 due north (the rear).
   The front carries a peak every ~12 degrees, the rear one every ~26, and the
   rear drops one to a gap so the ring never quite closes. */
const SEAMOUNT_ARCS = [
  { from: 25,  to: 155, n:11, gap:-1 },   // the front, thickest
  { from: 155, to: 205, n:3,  gap:-1 },   // the western flank
  { from:-25,  to: 25,  n:3,  gap:-1 },   // the eastern flank
  { from: 205, to: 335, n:5,  gap: 2 },   // the rear, broken
];
const SEAMOUNTS = (()=>{
  const out=[];
  for(const ring of SEAMOUNT_RINGS){
    let k=0;
    for(const arc of SEAMOUNT_ARCS){
      for(let i=0;i<arc.n;i++,k++){
        if(i===arc.gap) continue;                          // the break in the ring
        const h=seamountHash(k, ring.hx!=null?ring.hx:ring.cx),
              h2=seamountHash(k+13, ring.hy!=null?ring.hy:ring.cy);
        const deg=arc.from+(arc.to-arc.from)*((i+0.5)/arc.n)+(h2-0.5)*7;
        const a=deg*Math.PI/180;
        const rr=ring.r*(0.90+h*0.22);
        out.push({ ring:ring.id, name:ring.name, info:ring.info,
          x:ring.cx+Math.cos(a)*rr, y:ring.cy+Math.sin(a)*rr*0.86,
          deg, s:0.7+h*0.7 });
      }
    }
  }
  return out;
})();

/* ---- ITEM 5: The Far Shore — the Land of the Dead (July 2026 lockdown).
   Placed at the far north-eastern corner so its ellipse runs off the edge of
   the map on purpose: the far shore lies beyond the world's edge, and the
   clipping is the point. Never nudge it inland. kind:'grey' paints ashen
   coast with no vegetation; special:'farshore' drives the mist, the spectral
   label, and the grey unreflecting water between it and the Last Door. ---- */
/* [ITEM 2, this round: the full dread treatment. Bigger, walled by dark
   mountains, three volcanoes burning about it, red clouds, fog banks,
   ember-fall, grey water for ~150 mi and along the crossing. The sea never
   freezes here or at the Isle of the Last Door.] */
ISLANDS.push(
  { id:'landofthedead', name:'The Far Shore — the Land of the Dead', x:8880, y:180, rx:300, ry:200, seed:0.0, kind:'grey', special:'farshore',
    volcanoes:[[8680,345],[8950,400],[8705,40]],   // two flanking the front approach, one behind
    info:'The Underworld: the far shore of the dead, beyond the Isle of the Last Door, across water no chart measures. Only a hull of Wardwood timber reaches it, and the druids decide who receives one. The dead can be spoken to and cannot be returned. They do not want to come. Mountains wall its shore; three volcanoes burn about it; the clouds above it are red, and fire falls where rain should. [LOCKED — The Unhealed, July 2026; placement on the map is symbolic: the far shore lies beyond the world’s edge]' }
);

/* ---- The Unhealed / The Angels Door: the two far-northern isles
   (July 2026 lockdown). hidden:true keeps them out of the raster, the
   terrain model and the coastal banding entirely \u2014 they draw, label and
   hit-test only while the Hidden World layer is on. ---- */
ISLANDS.push(
  { id:'lastdoor', name:'The Isle of the Last Door', x:7300, y:350, rx:55, ry:38, seed:4.4, kind:'rock', hidden:true,
    info:'Northeast of the continent, past the last of the northern islands: ringed by whirlpools and jagged rock, sirens roosting on the stones. The clouds above it are red and drop sparks instead of rain; the ground is black; the water for a mile out is grey and does not reflect. The gate on it is an angelic repair built from the remains of the Tree of Souls \u2014 given mockingly by Serathane, through whom the road to the dead now runs. The gate works. The dead come, and it is genuinely them. The price is a soul name, and the names feed his frozen archive; he holds only the souls who passed before his consumption of the Tree. Only a hull of Wardwood timber reaches it. [LOCKED \u2014 The Unhealed + The Angels Door amendment, July 2026]' },
  /* [ITEM 2, this round: the Sirens' Roost restored at full canon strength \u2014
     bigger, named for what roosts there, and carrying the winter-crossing
     sentence. Still hidden:true \u2014 on no chart \u2014 and the Deep-season ice
     reaches it: the sirens walk to the mainland across the frozen sea.] */
  { id:'lostisle', name:'The Lost Isle \u2014 the Sirens\u2019 Roost', x:4300, y:250, rx:60, ry:40, seed:1.7, kind:'rock', hidden:true,
    info:'Among the many islands of the Northern Sea, beyond the shores of the Northern Throne. It is on no chart, no ship has ever reached it on purpose, and roughly one crew a generation reaches it by accident and does not return. The sirens roost here: a woman\u2019s head, a woman\u2019s hands, enormous wings, the body of a raptor \u2014 and cloaks, which is the detail that should not belong on a monster. When the northern ocean freezes, they walk the ice to the mainland, and the Stone-Ears hold the line. [LOCKED \u2014 The Unhealed. PROPOSED: they are psychopomps; never stated on the page.]' }
);

/* ---- elven ring gates: passage to and from the coast ---- */
const RING_GATES = [
  { id:'rg_golden', name:'The Golden Mouth', deg:293,
    info:'Harbor channel through the Elven Forest Ring connecting the Golden Coast to the open sea \u2014 the busiest passage on the southern arc. Gate fees are a major source of elven wealth.' },
  { id:'rg_sunward', name:'The Sunward Arch', deg:268,
    info:'Ring passage on the Sundisk\u2013coast road, above the Wailing Cliffs. The fishing fleets pass beneath living boughs older than the Sunlands. [Name PROPOSED]' },
  { id:'rg_iron', name:'The Iron Mouth Watch', deg:91,
    info:'Northern ring passage over the Iron Mouth strait. Narrow, dangerous; Northern crews navigate it expertly while elven wardens watch from the canopy.' },
  { id:'rg_dragon', name:'The Dragon\u2019s Throat Watch', deg:357,
    info:'Eastern ring passage where the Three Great Rivers meet the sea. The most heavily trafficked gate on the continent.' },
  { id:'rg_ashen', name:'The Ashen Passage', deg:175,
    info:'Western ring passage on the Mournscar road. The wardens here screen for corruption as strictly as the Bone Gate itself. [Name PROPOSED]' },
  { id:'rg_smuggler', name:'The Smuggler\u2019s Gap', deg:193,
    info:'Unofficial passage skirting the northern rim of the Void Queen\u2019s Swamp. The elves look the other way \u2014 Port Royale access, and the debts that buys are never written down. Smugglers who stray south of the marked channel are not robbed; they are simply never seen again.' },
  { id:'rg_pearl', name:'The Pearl Threshold', deg:338,
    info:'Ring passage on the Jade arc serving the Pearl Isles trade. Tribute fleets of the Nine Lanterns pass here under double inspection. [PROPOSED]' },
  { id:'rg_crown', name:'The Crown Threshold', deg:310,
    info:'Ring passage on the Albion arc. The Chartered Companies pay the heaviest tolls on the continent here, and consider it cheap. [PROPOSED]' },
  { id:'rg_winter', name:'The Winter Threshold', deg:135,
    info:'Northwestern ring passage, open only in the brief thaw. The wardens here are said to accept the Toll of Leaves: passage paid in a memory, surrendered into elven keeping. [PROPOSED \u2014 Toll of Leaves pending RECONCILE ruling]' },
];
function ringGatePos(deg){
  const a=-deg*Math.PI/180;
  const rr=(FOREST_RING.inner+FOREST_RING.outer)/2;
  const c=coastNoise(a);
  return [ WORLD.cx+Math.cos(a)*WORLD.a*rr*c, WORLD.cy+Math.sin(a)*WORLD.b*rr*c ];
}

/* ---- expanded Sunlands vassals (seven new, PROPOSED) ---- */
SETTLEMENTS.push(
  { id:'waymeet', name:'Waymeet', x:5700, y:3300, type:'town', kingdom:null, pop:'~30,000',
    info:'Free crossroads town in the unclaimed corridor between the Heartlands, the Imperium, and the Jade Empire; four roads, three currencies, no king. [PROPOSED]' },
  { id:'tollgreen', name:'Tollgreen', x:5900, y:3900, type:'village', kingdom:null, pop:'~8,000',
    info:'Borderland toll-village on the Jade road; its green is the neutral ground where caravan disputes are settled by wager. [PROPOSED]' },
  { id:'eastmarch', name:'Eastmarch', x:6000, y:2900, type:'town', kingdom:null, pop:'~22,000',
    info:'March-town in the shadow of the Jade Wall, half garrison and half grain market, sworn to no throne and courted by two. [PROPOSED]' },
  { id:'pilgrimsrest', name:'Pilgrim\u2019s Rest', x:5450, y:3700, type:'village', kingdom:null, pop:'~6,000',
    info:'Hospice-village on the pilgrim road between Trinity Citadel and the World Tree; beds are free, silence is mandatory. [PROPOSED]' },
  { id:'fairmile', name:'Fairmile', x:5650, y:4200, type:'village', kingdom:null, pop:'~9,000',
    info:'Borderland fair-town north of Albion\u2019s marches, famous for its horse market and its forgeries of both. [PROPOSED]' },
  { id:'ashford', name:'Ashford', x:2900, y:3700, type:'town', kingdom:null, pop:'~15,000',
    info:'The last honest crossing before the Ashlands corridor; its ford-wardens screen for corruption with mirrors and salt. [PROPOSED]' },
  { id:'westmarch', name:'Westmarch', x:3300, y:3300, type:'town', kingdom:null, pop:'~18,000',
    info:'Free march-town of the western corridor between the Heartlands and the Ashlands, where Crown Road silver meets salvage barter. [PROPOSED]' },
  { id:'greyfield', name:'Greyfield', x:3100, y:2800, type:'village', kingdom:null, pop:'~7,000',
    info:'Borderland grain village under a sky that is grey more often than it should be; the Ashlands are closer than the maps admit. [PROPOSED]' },
  { id:'twinwells', name:'Twinwells', x:3500, y:3900, type:'village', kingdom:null, pop:'~5,000',
    info:'Two wells, one sweet and one bitter, and a village that has argued about which is which for two hundred years. [PROPOSED]' },
  { id:'dunmoor', name:'Dunmoor', x:3700, y:4200, type:'village', kingdom:null, pop:'~6,500',
    info:'Moorland herders\u2019 village between the Sunlands\u2019 marches and the Heartlands, paying grass-rent to whichever rider arrives first. [PROPOSED]' },
  { id:'highpass', name:'Highpass', x:4200, y:2250, type:'town', kingdom:null, pop:'~12,000',
    info:'Free town at the Crown Ridge crossing between the North and the Heartlands; snowbound four months, rich the other eight. [PROPOSED]' },
  { id:'coldwater', name:'Coldwater', x:4700, y:2200, type:'village', kingdom:null, pop:'~7,500',
    info:'Ridge village on the northern trade road; its inn\u2019s cellar is dug into a barrow no one discusses. [PROPOSED]' },
  { id:'legionsrest', name:'Legion\u2019s Rest', x:3900, y:2100, type:'village', kingdom:null, pop:'~5,500',
    info:'Veterans\u2019 village founded by discharged Vaelthorne auxiliaries who took their citizenship and walked east until the ash stopped falling. [PROPOSED]' },
  { id:'thanesford', name:'Thanesford', x:5000, y:2450, type:'village', kingdom:null, pop:'~6,000',
    info:'Border ford between the Imperium\u2019s marches and the Heartlands, held by a thane-family that swears to both and obeys neither. [PROPOSED]' },
  { id:'weiling', name:'Wei-Ling', x:6500, y:2900, type:'town', kingdom:'jade', pop:'~140,000',
    info:'Canal market town of the upper rivers; Clan Wei-Long\u2019s dyke-works begin here, and so does their power. [PROPOSED]' },
  { id:'jinshan', name:'Jinshan', x:7300, y:3150, type:'town', kingdom:'jade', pop:'~160,000',
    info:'Gold-hill town beneath the Jade Mountains; its monastery mint strikes the Empire\u2019s coin under Xun-Wei seal. [PROPOSED]' },
  { id:'heronsrest', name:'Heron\u2019s Rest', x:6800, y:4200, type:'town', kingdom:'jade', pop:'~90,000',
    info:'Heron-Boat Guild home port on the southern rivers; the eel-run tithe is counted here, basket by basket. [PROPOSED]' },
  { id:'luzhen', name:'Lu-Zhen', x:7500, y:4100, type:'town', kingdom:'jade', pop:'~120,000',
    info:'Silk-weaving river town of the delta approaches; its looms never stop and its debts to the silk monopoly never shrink. [PROPOSED]' },
  { id:'qiaolin', name:'Qiao-Lin', x:6450, y:3900, type:'village', kingdom:'jade', pop:'~30,000',
    info:'Bridge-village of the western terraces; rice paid as tax leaves by the ton and returns by the bowl. [PROPOSED]' },
  { id:'oakhollow', name:'Oakhollow', x:4200, y:3050, type:'village', kingdom:'heartlands', pop:'~9,000',
    info:'Grove-village of the northern Heartlands; its ward-tree is older than three kingdoms and the Bough-Wards count its leaves. [PROPOSED]' },
  { id:'barleymere', name:'Barleymere', x:4850, y:3750, type:'village', kingdom:'heartlands', pop:'~11,000',
    info:'Breadbasket village on the southern plain; its harvest festival sets the Fallow-Clans\u2019 planting law for the year. [PROPOSED]' },
  { id:'rowanstead', name:'Rowanstead', x:4100, y:3600, type:'village', kingdom:'heartlands', pop:'~8,500',
    info:'Rowan-ringed village of the western Heartlands, where travelers from the Ashlands road are fed first and questioned never. [PROPOSED]' },
  { id:'fallowdene', name:'Fallowdene', x:4700, y:3300, type:'village', kingdom:'heartlands', pop:'~7,000',
    info:'Rotation-farming village in the World Tree\u2019s morning shadow; one field in three sleeps, by law older than writing. [PROPOSED]' },
  { id:'hazelmoor', name:'Hazelmoor', x:4350, y:3950, type:'village', kingdom:'heartlands', pop:'~6,500',
    info:'Hazel-hedged village of the southern Heartlands; its beekeepers supply the Grove-Moot\u2019s mead and hear everything. [PROPOSED]' },
  { id:'elmsworth', name:'Elmsworth', x:4950, y:3450, type:'town', kingdom:'heartlands', pop:'~20,000',
    info:'Market town on the Heaven\u2019s Gate Pass road, the last Heartlands settlement before the Spine; muleteers and mapmakers drink in separate rooms. [PROPOSED]' },
  { id:'ulfgard', name:'Ulfgard', x:4050, y:1550, type:'town', kingdom:'northern', pop:'~35,000',
    info:'Jarl-town of the western Frostmark; its wolf-banner hall has feuded with Ironhold for nine generations and intends to finish it. [PROPOSED]' },
  { id:'sigmarsholt', name:'Sigmarsholt', x:4900, y:1700, type:'town', kingdom:'northern', pop:'~28,000',
    info:'Timber-and-iron town at the Jotunwood\u2019s eastern eaves; its thing-stone still stands, and the jarls still argue on it, and the Iron King still does not listen. [PROPOSED]' },
  { id:'thrymstead', name:'Thrymstead', x:3700, y:1350, type:'village', kingdom:'northern', pop:'~12,000',
    info:'Hard village of the high Frostmark, proud of surviving what softer towns did not; its winter-hall code is carved over the door. [PROPOSED]' },
  { id:'clermont', name:'Clermont', x:5400, y:1750, type:'village', kingdom:'imperium', pop:'~14,000',
    info:'Vineyard-and-vellum village of the Imperium\u2019s western sees; half its harvest is tithe and the other half is penance. [PROPOSED]' },
  { id:'abbotsgate', name:'Abbotsgate', x:5900, y:2100, type:'town', kingdom:'imperium', pop:'~25,000',
    info:'Gate-town of the eastern pilgrim road, run by an abbey that stamps travel writs and remembers every face it refuses. [PROPOSED]' },

  { id:'hvalvik', name:'Hvalvik', x:4124, y:807, type:'town', kingdom:'northern', pop:'~25,000',
    info:'The Whale-Road port: iron out, fish in. Its fleets track the whale and herring runs, and its taverns keep the Deep Watch ledger of the Sleepers, sea-mountains that breathe. [PROPOSED]' },
  { id:'cinerra', name:'Cinerra', x:2750, y:1500, type:'town', kingdom:'vaelthorne', pop:'~90,000',
    info:'A wealthy resort city under a live volcano. Doomed and joyous, and its citizens know both and stay. [PROPOSED]' },
  { id:'sparthelon', name:'Sparthelon', x:3300, y:1900, type:'vassal', kingdom:'vaelthorne', pop:'~70,000',
    info:'Austere martial city-vassal; its children are raised in a communal agoge and its ephors pay tribute in soldiers, never coin. [PROPOSED]' },
  { id:'montsacre', name:'Montsacr\u00e9', x:5750, y:2150, type:'town', kingdom:'imperium', pop:'~60,000',
    info:'The mountain shrine-city above Trinity Citadel, terminus of the Pilgrim Roads of the Nine Shrines and home of the contested Reliquary of the First Dawn. [PROPOSED]' },
  { id:'drunhollow', name:'Drunhollow', x:4200, y:3200, type:'town', kingdom:'heartlands', pop:'~45,000',
    info:'A grove-town legally forbidden to wall itself: neutrality made architecture. Seat of the Grove-Moot of the Nine Boughs beneath the World Tree\u2019s shadow. [PROPOSED]' },
  { id:'loushan', name:'Lou-Shan', x:6650, y:3100, type:'town', kingdom:'jade', pop:'~110,000',
    info:'The Examination City, where bureaucrats are minted and failure-scholars become a resentful underclass the eunuchs quietly harvest. [PROPOSED]' },
  { id:'seorin', name:'Seorin', x:7200, y:2550, type:'vassal', kingdom:'jade', pop:'~200,000',
    info:'Highest-seated of the Nine Lanterns tributaries, proud and prickly about precedence; its jade-and-rice mission opens the tribute season. [PROPOSED]' },
  { id:'cindermarch', name:'Cindermarch', x:1700, y:3000, type:'town', kingdom:'ashlands', pop:'~35,000',
    info:'The largest outcast market, built into a pre-Forgetting ruin whose original purpose no one can name. Governed by a salvage-council; currency is barter and reputation. [PROPOSED]' },
  { id:'saltcastle', name:'Saltcastle', x:6100, y:5350, type:'town', kingdom:'albion', pop:'~180,000',
    info:'The great naval dockyard town of Albion Magna; half the Nine Tides fleet was laid down in its slips. [PROPOSED]' },
  { id:'wrackhaven', name:'Wrackhaven', x:6800, y:4750, type:'town', kingdom:'albion', pop:'~55,000',
    info:'Whaling and herring port at the mouth of the Herring Road; home port of the Wrack-Divers, who bring up hulls older than any record. [PROPOSED]' },
  { id:'vorkane', name:'Vor\u2019kane', x:6750, y:1700, type:'town', kingdom:'zarkaine', pop:'~120,000',
    info:'A black-glass city built into a live caldera wall; hearth-seat of the Nine Hearth-Clans of the Sulfur Basin. [PROPOSED]' },

  { id:'bakoro', name:'Bakoro', x:4550, y:4850, type:'vassal', kingdom:'sunlands', pop:'55,000',
    info:'Fortress vassal on the gold road between the northern mines and Sundisk. Its walls have never been paid for twice. [PROPOSED]' },
  { id:'zafara', name:'Zafara', x:3750, y:4900, type:'vassal', kingdom:'sunlands', pop:'50,000',
    info:'Dune caravan city of the northwest Solanu; sand sailors refit here between Harmattan winds. [PROPOSED]' },
  { id:'keltamar', name:'Kel Tamar', x:3450, y:5600, type:'vassal', kingdom:'sunlands', pop:'38,000',
    info:'Caravanserai kingdom on the salt road south of the Great Flats; sworn to House Diallo\u2019s trade peace. [PROPOSED]' },
  { id:'nyati', name:'Nyati', x:4750, y:5750, type:'vassal', kingdom:'sunlands', pop:'45,000',
    info:'Herd-lords of the southeastern savanna belt; their cattle tithe feeds the Sundisk garrisons. [PROPOSED]' },
  { id:'imaru', name:'Imaru', x:4644, y:5997, type:'vassal', kingdom:'sunlands', pop:'25,000',
    info:'Pearl-diving vassal on the coastal strip beyond the Ring, east of the Wailing Cliffs. [PROPOSED]' },
  { id:'obasi', name:'Obasi', x:5450, y:5250, type:'vassal', kingdom:'sunlands', pop:'70,000',
    info:'River-delta vassal where an underground river surfaces; the only rice terraces in the Sunlands. [PROPOSED]' },
  { id:'tessalit', name:'Tessalit', x:3080, y:5100, type:'vassal', kingdom:'sunlands', pop:'30,000',
    info:'Western marches vassal watching the Ashlands corridor; half garrison, half market. [PROPOSED]' }
);


/* ---- War Powers overlay (elves and Heartlands neutral; two-bloc scenario) ---- */
const WAR = {
  blocs: [
    { id:'north', name:'The Northern Bloc', color:'#5b8fc4',
      kingdoms:['northern','imperium','jade'],
      note:'Food (Jade), iron (the Throne), legitimacy (the Imperium). Lacks nothing a long war needs.' },
    { id:'south', name:'The Southern Bloc', color:'#d08a3a',
      kingdoms:['sunlands','albion','ashlands'],
      note:'Gold, navy, and unconquerable ground. No food security and no iron: it must win fast or starve slow.' },
  ],
  neutral:['heartlands','vaelthorne','zarkaine'],
  profiles:{
    jade:{ strength:'Largest population; food and water monopoly', asset:'The Jade Wall: never fully conquered', weakness:'Child-emperor puppet court; eunuch factionalism' },
    northern:{ strength:'Sixty percent of continental iron; the Underkeep', asset:'Arms every side, or none', weakness:'Five million cannot occupy a continent' },
    imperium:{ strength:'Religious authority inside every kingdom', asset:'Inquisitor screening at every Gate', weakness:'Militarily middling; decisive only as an ally' },
    sunlands:{ strength:'Eighty-five percent of gold; the desert as army', asset:'Three-Zone Defense: invaders die before arriving', weakness:'Gold is not food; import-dependent' },
    albion:{ strength:'Naval supremacy and the debt markets', asset:'The Victualling Chain and the Chartered Isles', weakness:'Sea power exists on elven tolerance' },
    ashlands:{ strength:'Cannot be conquered; nothing to hold', asset:'The Forsaken fight for nothing and cost nothing', weakness:'No economy, no food, no capital to project from' },
    heartlands:{ strength:'The Gate hub and the breadbasket', asset:'Attack it and unite the world against you', weakness:'A passive veto, not a sword' },
    vaelthorne:{ strength:'The finest soldiers and forges on the continent', asset:'Wins every field it stands on', weakness:'Refuses infrastructure; wins battles, loses wars' },
    zarkaine:{ strength:'Sealed and self-contained', asset:'A natural prison no one wants', weakness:'Out of the fight by design' },
  },
  verdict:'With the elves and the Heartlands neutral: the Northern Bloc wins by attrition. Food, iron, and legitimacy outlast gold, navies, and fortresses. The South\u2019s only path is a short war; the North\u2019s only risk is itself.',
};


/* ============================================================
   SEASONAL SYSTEMS — July 2026 research pass (Continental
   Expansion doc, Part III), reconciled to canon. The global
   season wheel has four stops; every zone reads the wheel
   through its own calendar (the taiga's eight-part calendar and
   the volcanic vent-cycle are offsets, not exceptions).
   [Seasonal layer set PROPOSED, July 2026]
   ============================================================ */
const SEASON_STOPS = [
  { idx:0, key:'early', label:'Early' },
  { idx:1, key:'high',  label:'High'  },
  { idx:2, key:'late',  label:'Late'  },
  { idx:3, key:'deep',  label:'Deep'  },
];
/* Per-zone calendar: what each wheel stop is called locally. */
const SEASON_NAMES = {
  sahel:    ['First Rain','The Greening','Long Dust onset','The Long Dust'],
  monsoon:  ['Spring dispersal','The Plum Rains','The autumn runs','The Clear Cold'],
  taiga:    ['Thaw ascent (eight-part calendar)','High summer — the Great Thing','Autumn descent','The Ten-Month Dark'],
  maritime: ['The Whale-Spring','High sail','The Herring-Fall','The Gale-Dark'],
  alpine:   ['The Ascent','The High Summer','The Descent','The Deep Snow'],
  volcanic: ['The Bloom','The Quiet','The Ashfall','The Quiet (recolonization)'],
};

/* Migration flow sets: animated particle polylines, one set per
   zone per season, driven by SEASONS[zone].movements.
   dir: +1 = forward along path, -1 = reverse. seasons maps wheel
   stop -> dir (absent stop = flow inactive).
   Migrations are the food calendar, not decoration.
   [All flows PROPOSED, July 2026] */
const MIGRATIONS = [
  { id:'mg_herds', zone:'sahel', name:'Herd transhumance', kind:'herd', color:'#e0b45a',
    seasons:{0:-1, 2:1, 3:1},
    paths:[ [[3900,4700],[3750,5200],[3700,5750]],
            [[4550,4850],[4650,5300],[4750,5750]],
            [[4300,4600],[4300,5200],[4300,5800]] ],
    info:'Cattle and camel herds of the herd-confederacies: south to the floodplain margins at the onset of the Long Dust, north again at first rain. The herd-route congresses meet where the arrows cross. [PROPOSED]' },
  { id:'mg_eels', zone:'monsoon', name:'Eel runs of the Three Rivers', kind:'eel', color:'#9fd4e8',
    seasons:{2:1, 3:-1},
    paths:[ [[6350,2700],[6800,3050],[7300,3400],[7850,3620]],
            [[6250,3400],[6800,3550],[7400,3620],[7850,3650]],
            [[6350,4300],[6900,4000],[7450,3760],[7850,3680]] ],
    info:'Silver eels run downriver to the sea in the autumn; glass-eels climb back upriver in the late winter. The Heron-Boat Guild’s nets — and its monopoly tolls — are timed to this calendar. [PROPOSED]' },
  { id:'mg_cranes', zone:'monsoon', name:'Crane arrival', kind:'crane', color:'#e8e2d0',
    seasons:{0:-1, 2:1},
    paths:[ [[6500,2500],[6700,3200],[6900,3900]],
            [[7700,2900],[7250,3500],[6900,3900]],
            [[7900,4400],[7400,4150],[6900,3900]] ],
    info:'Half a million cranes and geese converge on the Lake of a Hundred Autumns as it shrinks into its hundred pools, and disperse north again in spring. The decade fishing ban exists for them; the crane festivals exist for everyone else. [PROPOSED]' },
  { id:'mg_reindeer', zone:'taiga', name:'Reindeer-kin bands', kind:'reindeer', color:'#cfd9e4',
    seasons:{0:1, 2:-1},
    paths:[ [[4250,1850],[4200,1400],[4150,1000]],
            [[4450,1800],[4550,1350],[4600,1050]] ],
    info:'Reindeer-kin bands move up to 400 miles between the Jotunwood’s winter lichen and the summer pasture of the northern coast strip. The corrals wait at the bottlenecks; calf-marking follows the thaw. [PROPOSED]' },
  { id:'mg_whales', zone:'maritime', name:'Whale-kin tracks', kind:'whale', color:'#8fc4e8',
    seasons:{0:1, 1:1, 2:-1, 3:-1},
    paths:[ [[8250,5200],[8400,3900],[8350,2600],[8100,1500]],
            [[6600,6100],[5400,6450],[4200,6500],[3400,6300]] ],
    info:'Whale-kin run north along the eastern and southern seas to the summer feeding grounds and south again to calve in winter. Hvalvik and Wrackhaven set their fleets by these tracks; the Deep Watch keeps its other ledger. [PROPOSED]' },
  { id:'mg_herring', zone:'maritime', name:'The Herring Road', kind:'herring', color:'#b9d9ea',
    seasons:{2:1},
    paths:[ [[6950,4650],[7400,4350],[7800,3900],[8050,3400]] ],
    info:'The Herring Road pulses in the Herring-Fall: stock-specific runs that the herring fleets — and the victualling contracts of the Nine Tides — live and die by. [PROPOSED]' },
  { id:'mg_seabirds', zone:'maritime', name:'Gannet Stacks colonies', kind:'seabird', color:'#e8eef2',
    seasons:{0:1, 1:1}, cluster:{x:7080, y:5060, r:90},
    paths:[ [[7080,5060],[7080,5060]] ],
    info:'Seabird colonies crowd the Gannet Stacks from spring to late summer. The egg-harvest is taxed, tabooed, and taken anyway. [PROPOSED]' },
  { id:'mg_ibex', zone:'alpine', name:'Ibex Passes', kind:'ibex', color:'#d9c9a8',
    seasons:{0:1, 2:-1},
    paths:[ [[5520,2430],[5450,2350],[5400,2280]],
            [[5900,2400],[5870,2330],[5850,2260]] ],
    info:'Ibex-kin and deer-kin climb with the spring and drop with the first snow: short, steep altitude migrations along the Ibex Passes. [PROPOSED]' },
  { id:'mg_livestock', zone:'alpine', name:'The Ascent and the Descent', kind:'livestock', color:'#e0d0b0',
    seasons:{0:1, 2:-1},
    paths:[ [[5700,2100],[5760,2200],[5800,2300]],
            [[5500,1900],[5560,2050],[5600,2180]] ],
    info:'The livestock transhumance of the Alpine Charterhouses: valley to high pasture in late spring, down again in autumn. The cheese-and-tithe economy climbs and descends with it. At the Descent festival, garlands go only to the herds that lost nothing; the ungarlanded walk the same road. [PROPOSED]' },
  { id:'mg_recol', zone:'volcanic', name:'Recolonization pulses', kind:'recol', color:'#9fe0a8',
    seasons:{3:1},
    paths:[ [[1150,2550],[1600,2950],[1950,3350]],
            [[2650,3700],[2300,3500],[1950,3350]],
            [[7500,1700],[7100,1650],[6800,1550]],
            [[6300,1100],[6550,1350],[6800,1550]] ],
    info:'After each Ashfall event, life recolonizes inward from the zone edges — changed. The honest register of the toxic zones is not monsters; it is the Bloomfields and the Pale Hounds: recolonization plus subtle wrongness. [PROPOSED]' },
];

/* Human-activity markers, timed to the wheel. Text is
   research-derived (Continental Expansion doc, July 2026). */
const SEASON_ACTIVITIES = [
  { id:'act_saltcamps', name:'Salt camps of the Great Flats', x:3230, y:5210, zone:'sahel', seasons:[2,3], glyph:'⌗',
    info:'The salt camps work only in the Dust, when Faro’s Mirror gives up its water and leaves harvestable salt behind. House Diallo’s caravans of 500–12,000 camels carry it north and east, weight-for-weight with gold. [PROPOSED]' },
  { id:'act_caravans', name:'Cool-season caravans', x:3450, y:5600, zone:'sahel', seasons:[0], glyph:'⤴',
    info:'The long caravans move in the cool months, well-to-well down the salt road. Each of the Seven Wells of Azalai is a treaty-point where no blood may be shed. [PROPOSED]' },
  { id:'act_greatthing', name:'The Great Thing', x:4900, y:1700, zone:'taiga', seasons:[1], glyph:'⚖',
    info:'The summer Great Thing at Sigmarsholt’s thing-stone: the jarls of the Frostmark advise a king who does not listen, and everyone attends anyway. Vestigial custom doing political work. [PROPOSED]' },
  { id:'act_calfmark', name:'Calf-marking corrals', x:4500, y:1750, zone:'taiga', seasons:[0], glyph:'⚬',
    info:'Corrals at the migration bottlenecks; calf-marking follows the thaw as the reindeer-kin bands move north. [PROPOSED]' },
  { id:'act_iceroads', name:'The Volok ice roads', x:4600, y:1150, zone:'taiga', seasons:[3], glyph:'✥',
    info:'Deepmere freezes solid and becomes a winter road. The Volok Haulers drag longships across it between waterways, paid in iron and lamp-oil; they control inland winter trade. [PROPOSED]' },
  { id:'act_descent', name:'The Descent festival', x:5750, y:2150, zone:'alpine', seasons:[2], glyph:'⚘',
    info:'The Charterhouse valleys garland only the herds that came down without loss. The festival renders both kinds — the garlanded and the grieving walk the same road, and the cheese-tithe is counted either way. [PROPOSED]' },
  { id:'act_cranefest', name:'Crane festivals', x:6900, y:3900, zone:'monsoon', seasons:[3], glyph:'✥',
    info:'The winter crane festivals of the Jade Empire, held on the hundred shores of the shrunken lake while the Xun-Wei watch for fishing-ban smugglers. [PROPOSED]' },
  { id:'act_salvage', name:'Salvage runs', x:1700, y:3000, zone:'volcanic', seasons:[1], glyph:'⚒',
    info:'In the Quiet, Cindermarch’s salvage-council licenses runs into the deep Ashlands, and the chant-maps are revised by whoever comes back. Sing past, never through. [PROPOSED]' },
];

/* Seasonal travel modifiers — flag PROPOSED in UI until ratified. */
const SEASON_TRAVEL = {
  note:'[PROPOSED] Seasonal travel modifiers await ratification: deep winter halves foot and mounted speed in taiga and alpine country but opens the ice roads; the Harmattan slows desert travel by a fifth; the Plum Rains slow the Jade plains but speed the rivers.',
  /* zoneOf(x,y) is resolved in the travel model; factors multiply the base terrain multiplier. */
  deepWinterZones:['northern','imperium'],      // taiga + alpine kingdoms
  harmattanSeasons:[2,3],                       // Long Dust onset + Long Dust
  deepSeasons:[3],
  monsoonSeasons:[1],
};

/* Divine Flow overlay: deferred. Every seasonal layer eventually
   gets a Flow annotation (the Greening tracks a Flow surge; the
   Quiet is a Flow ebb). Specifics defer to the Divine Flow
   Ecology document — extend, never contradict. */
const FLOW_NOTE = 'Flow annotations deferred to the Divine Flow Ecology document. The Greening tracks a Flow surge; the Quiet is a Flow ebb. Extend, never contradict.';

const TDA_DATA = {
  WORLD, KINGDOMS, FOREST_RING, MOUNTAINS, RIVERS, LAKES, MARSHES, FORESTS,
  SETTLEMENTS, GATES, RING_GATES, WONDERS, HIDDEN, ISLANDS, SEAMARKS, ROUTES,
  COSMOS, TRAVEL, SEASONS, BADLANDS, MAELSTROMS, SEAMOUNT_RINGS, SEAMOUNTS, WAR,
  SEASON_STOPS, SEASON_NAMES, MIGRATIONS, SEASON_ACTIVITIES, SEASON_TRAVEL, FLOW_NOTE,
  coastNoise, islandNoise, ringGatePos,
};
if (typeof module !== 'undefined' && module.exports) module.exports = TDA_DATA;
if (typeof globalThis !== 'undefined') globalThis.TDA_DATA = TDA_DATA;

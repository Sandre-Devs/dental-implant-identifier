require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

const manufacturers = [
  { name: 'Neodent',         country: 'Brasil',        website: 'neodent.com.br' },
  { name: 'Straumann',       country: 'Suíça',         website: 'straumann.com' },
  { name: 'Nobel Biocare',   country: 'Suécia',        website: 'nobelbiocare.com' },
  { name: 'MIS Implants',    country: 'Israel',        website: 'mis-implants.com' },
  { name: 'Osstem',          country: 'Coreia do Sul', website: 'osstem.com' },
  { name: 'SIN Implant System', country: 'Brasil',     website: 'sinimplantsystem.com.br' },
  { name: 'Zimmer Biomet',   country: 'EUA',           website: 'zimmerbiomet.com' },
  { name: 'BioHorizons',     country: 'EUA',           website: 'biohorizons.com' },
  { name: 'MegaGen',         country: 'Coreia do Sul', website: 'megagen.com' },
  { name: 'Bionnovation',    country: 'Brasil',        website: 'bionnovation.com.br' },
];

const systems = {
  'Neodent': [
    { name: 'Titamax CM',    connection_type: 'cone_morse',  platform: 'CM' },
    { name: 'Titamax GM',    connection_type: 'hex_interno', platform: 'GM' },
    { name: 'Titamax Helix', connection_type: 'cone_morse',  platform: 'CM' },
    { name: 'Alvim',         connection_type: 'cone_morse',  platform: 'CM' },
  ],
  'Straumann': [
    { name: 'BLT (Bone Level Tapered)', connection_type: 'trilobe', platform: 'BLT' },
    { name: 'BL (Bone Level)',          connection_type: 'trilobe', platform: 'BL' },
    { name: 'TL (Tissue Level)',        connection_type: 'trilobe', platform: 'TL' },
  ],
  'Nobel Biocare': [
    { name: 'Nobel Active',    connection_type: 'hex_interno', platform: 'NP/RP/WP' },
    { name: 'Nobel Replace',   connection_type: 'trilobe',     platform: 'NP/RP/WP' },
    { name: 'All-on-4',        connection_type: 'hex_interno', platform: 'Multi-unit' },
  ],
  'MIS Implants': [
    { name: 'V3', connection_type: 'cone_morse',  platform: 'V3' },
    { name: 'C1', connection_type: 'hex_interno', platform: 'C1' },
  ],
  'Osstem': [
    { name: 'TSIII', connection_type: 'hex_interno', platform: 'TS' },
    { name: 'USII',  connection_type: 'hex_externo', platform: 'US' },
  ],
  'SIN Implant System': [
    { name: 'CFT (Cone Fix Titânio)', connection_type: 'cone_morse',  platform: 'CF' },
    { name: 'Master Screw',           connection_type: 'hex_externo', platform: 'MS' },
  ],
  'Zimmer Biomet': [
    { name: 'TSV (Tapered Screw-Vent)', connection_type: 'hex_interno', platform: 'TSV' },
    { name: 'Trabecular Metal',         connection_type: 'hex_interno', platform: 'TM' },
  ],
  'BioHorizons': [
    { name: 'Tapered Internal', connection_type: 'hex_interno', platform: 'TI' },
    { name: 'Laser-Lok',        connection_type: 'hex_interno', platform: 'LL' },
  ],
  'MegaGen': [
    { name: 'AnyRidge', connection_type: 'cone_morse',  platform: 'AR' },
    { name: 'EZ Plus',  connection_type: 'hex_externo', platform: 'EZ' },
  ],
  'Bionnovation': [
    { name: 'Epoxy Master', connection_type: 'cone_morse',  platform: 'EM' },
    { name: 'Titamax',      connection_type: 'hex_interno', platform: 'TI' },
  ],
};

const run = db.transaction(() => {
  for (const mfr of manufacturers) {
    const exists = db.prepare('SELECT id FROM manufacturers WHERE name = ?').get(mfr.name);
    if (exists) { console.log(`  ⏭️  ${mfr.name} já existe`); continue; }

    const mfrId = uuidv4();
    db.prepare('INSERT INTO manufacturers (id,name,country,website) VALUES (?,?,?,?)')
      .run(mfrId, mfr.name, mfr.country, mfr.website);
    console.log(`  ✅ ${mfr.name}`);

    for (const sys of (systems[mfr.name] || [])) {
      const sysId = uuidv4();
      db.prepare('INSERT INTO implant_systems (id,manufacturer_id,name,connection_type,platform) VALUES (?,?,?,?,?)')
        .run(sysId, mfrId, sys.name, sys.connection_type, sys.platform);
      console.log(`     └─ ${sys.name} (${sys.connection_type})`);
    }
  }
});

console.log('\n🌱 Populando fabricantes e sistemas de implantes...\n');
run();
console.log('\n✅ Seed concluído!\n');

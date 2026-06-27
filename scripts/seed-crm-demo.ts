import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('⏳ Seeding CRM Demo Data...');
  try {
    const { loadDemoData } = await import('../src/actions/demo');
    const res = await loadDemoData();
    if (res.error) {
      throw new Error(res.error);
    }
    console.log('✓ CRM Demo Data seeded successfully!');
  } catch (err) {
    console.error('❌ Error seeding CRM demo data:', err);
    process.exit(1);
  }
}

main();

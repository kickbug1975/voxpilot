import http from 'http';

function checkUrl(url: string) {
  return new Promise<void>((resolve) => {
    http.get(url, (res) => {
      console.log(`URL: ${url} -> Status: ${res.statusCode}`);
      resolve();
    }).on('error', (err) => {
      console.error(`Error fetching ${url}:`, err);
      resolve();
    });
  });
}

async function run() {
  await checkUrl('http://localhost:3000/demo-maree-belgique/products/8c1edf10-ecac-4096-9825-a32ca817b73a');
}

run().catch(console.error);

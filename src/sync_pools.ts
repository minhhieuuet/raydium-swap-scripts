import Downloader from 'nodejs-file-downloader';
(async() => {
  const downloader = new Downloader({
    url: "https://api.raydium.io/v2/sdk/liquidity/mainnet.json",
    directory: "./",
    fileName: "pools.json", //This will be the file name.
  });
})()

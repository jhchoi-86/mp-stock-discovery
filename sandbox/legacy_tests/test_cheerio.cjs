const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('naver_page.html', 'utf8');
const $ = cheerio.load(html);

console.log("WICS:", $('h4[title="WICS"]').text());
console.log("WICS a:", $('h4[title="WICS"] a').text());
console.log("Upjong:", $('dt:contains("업종")').parent().find('dd a').text());

const wics = $('h4.h_sub.sub_tit7[title="WICS"]').text();
console.log("Selector 2 WICS:", wics);

const wics3 = $('a.link_site').text();
console.log("All link_site:", wics3);

import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

function fmt(n) { return "Rp " + Number(n||0).toLocaleString("id-ID") }

const UNITS = ["gr","kg","ml","L","Galon","pcs","Ekor","butir","biji","buah","ikat","lembar","bungkus","pack","sachet","botol","tsp","tbsp","cup","porsi","portion","slice"]

const INGREDIENT_SEED = [
{"id":"ING-001","name":"MultiBev - Syrup Lychee","sku":"syrup lychee","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-002","name":"Acar (sub)","sku":"Acarsub","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-003","name":"Adonan Mendoan (sub)","sku":"AdonanMendoan","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-004","name":"Air","sku":"air","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Air/Gas"},
{"id":"ING-005","name":"Asem","sku":"asem","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-006","name":"Ayam Ekor","sku":"ayam pcs","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Ayam"},
{"id":"ING-007","name":"Ayam Taliwang (sub)","sku":"AyamTaliwangsub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-008","name":"Baking Powder","sku":"Baking Powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-009","name":"Bawang bubuk","sku":"bawang bubuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-010","name":"Bawang Merah","sku":"bawang merah","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":46,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-011","name":"Bawang Putih","sku":"bawang putih","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":40,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-012","name":"Bawang Putih/Merah Blend (sub)","sku":"BawangBlend","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-013","name":"Bawang Goreng (sub)","sku":"BawangGoreng","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-014","name":"Ketumbar Bubuk","sku":"BBD055","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-015","name":"Cooking cream","sku":"BBD075","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-016","name":"BBQ Sauce","sku":"BBQ sauce","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-017","name":"Beras","sku":"beras","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":14,"category":"General","supplier":"Supplier Beras"},
{"id":"ING-018","name":"Bihun","sku":"bihun","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-019","name":"Bihun Cooked","sku":"Bihun Cooked","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-020","name":"Black pepper","sku":"black pepper","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":360,"category":"General","supplier":""},
{"id":"ING-021","name":"Bombay","sku":"bombaygr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-022","name":"Bumbu Kacang (sub)","sku":"BumbuKacang","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-023","name":"Bumbu Racik","sku":"Bumbu Racik","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":1800,"category":"General","supplier":""},
{"id":"ING-024","name":"Cabe besar","sku":"cabebesargr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-025","name":"Cabe Merah","sku":"cabemerahgr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":50,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-026","name":"Cabe rawit","sku":"caberawitgr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":60,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-027","name":"Celupan Sate (sub)","sku":"CelupanSate","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-028","name":"Cengke","sku":"cengke","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-029","name":"Cheese","sku":"cheese","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":60,"category":"General","supplier":""},
{"id":"ING-030","name":"Cheese Powder","sku":"Cheese Powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-031","name":"Cheese Spread","sku":"cheese spread","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-032","name":"Cheese Sauce (sub)","sku":"CheeseSaucesub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-033","name":"Chicken powder knorr","sku":"chicken powder knorr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-034","name":"Chilli flakes","sku":"chili flake","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-035","name":"Chilli powder","sku":"chili powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-036","name":"Chilli Sauce","sku":"chilli sauce","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-037","name":"Choco crunchy","sku":"Chococrunchygr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-038","name":"Cinnamon stick","sku":"cinnamon stick","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-039","name":"Cireng (sub)","sku":"Cirengsub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-040","name":"Coklat Batang","sku":"Coklat Batang","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-041","name":"Cooking Oil","sku":"cooking oil","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-042","name":"Cuka","sku":"cuka","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-043","name":"Cup hot","sku":"cuphot","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-044","name":"Cup inject","sku":"cupinject","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-045","name":"Dada Ayam Filet","sku":"dada ayam filet","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Ayam"},
{"id":"ING-046","name":"Daging Kambing","sku":"daging kambing","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Daging Kambing"},
{"id":"ING-047","name":"Daun Pandan","sku":"daun pandan","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-048","name":"Daun Pisang","sku":"daun pisang","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-049","name":"Daun Salam","sku":"daun salam","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-050","name":"Daun Bawang","sku":"daunbawanggr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":20,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-051","name":"Daun Jeruk","sku":"daunjerukgr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":20,"category":"General","supplier":""},
{"id":"ING-052","name":"Ebi","sku":"ebigr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-053","name":"Espresso Base (sub)","sku":"EspressoBasesub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-054","name":"Evaporated Milk","sku":"evaporated milk","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-055","name":"Garam","sku":"garam","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":32,"category":"General","supplier":""},
{"id":"ING-056","name":"Garem Kerasak","sku":"garem kerasak","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-057","name":"Garlic powder","sku":"garlic powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-058","name":"Gas","sku":"Gas","unit":"botol","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Air/Gas"},
{"id":"ING-059","name":"Ginger Powder","sku":"ginger powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-060","name":"Gula Aren","sku":"gula aren","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-061","name":"Gula merah","sku":"gula merah","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":20,"category":"General","supplier":""},
{"id":"ING-062","name":"Gula Pasir","sku":"Gula Pasir","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-063","name":"Gula Semut","sku":"gula semut","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-064","name":"Honey","sku":"honey","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-065","name":"House Tea Base (sub)","sku":"HouseTeaBasesub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-066","name":"ICE","sku":"ice","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Es"},
{"id":"ING-067","name":"Ice Cream Chocolate","sku":"ice cream chocolate","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-068","name":"Ice Cream Strawberry","sku":"ice cream strawberry","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-069","name":"Ice Cream Vanilla","sku":"ice cream vanilla","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-070","name":"Jahe giling","sku":"Jahegiling","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-071","name":"Jahe","sku":"jahegr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":36,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-072","name":"Jeruk Peras","sku":"jeruk peras","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-073","name":"Jeruk limau","sku":"Jeruklimaugr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":40,"category":"General","supplier":""},
{"id":"ING-074","name":"Jinten","sku":"jinten","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-075","name":"Kacang Tanah","sku":"kacang tanah","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-076","name":"Kaldu Ayam Bubuk","sku":"kaldu ayam bubuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":10000,"category":"General","supplier":""},
{"id":"ING-077","name":"Kaldu Jamur","sku":"kaldu jamur","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":175,"category":"General","supplier":""},
{"id":"ING-078","name":"Kaldu Sapi Bubuk","sku":"kaldu sapi bubuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-079","name":"KapuLaga","sku":"kapulaga","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-080","name":"Kayu Mani","sku":"kayu manis","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-081","name":"Kecap Asin","sku":"kecap asin","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-082","name":"Kecap Manis Sedap","sku":"kecap manis sedap","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-083","name":"Kecap SH","sku":"kecap SH","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-084","name":"Kecap THG","sku":"kecap THG","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-085","name":"Keju Indofood","sku":"Keju Indofood","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-086","name":"Kelapa Parut","sku":"kelapa parut","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-087","name":"Kemangi","sku":"Kemangi","unit":"ikat","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-088","name":"Kemiri","sku":"kemirigr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":60,"category":"General","supplier":""},
{"id":"ING-089","name":"Kencur","sku":"kencur","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-090","name":"Kentang","sku":"kentang","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-091","name":"Kentang Goreng (sub)","sku":"KentangGoreng","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-092","name":"Kertas KFC","sku":"KertasKFC","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-093","name":"Kerupuk (sub)","sku":"Kerupuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-094","name":"Kerupuk bawang","sku":"kerupuk bawang gr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-095","name":"Kerupuk Udang","sku":"kerupukudanggr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":50,"category":"General","supplier":""},
{"id":"ING-096","name":"Kol","sku":"kol","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-097","name":"Kopi Kapal Api","sku":"Kopi Kapal Api","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-098","name":"Kuah Jahe (sub)","sku":"KuahJahe","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-099","name":"Kulit Ayam","sku":"kulitayam","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Ayam"},
{"id":"ING-100","name":"Kulit siomay","sku":"kulitsiomaypcs","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-101","name":"Kunyit","sku":"kunyit","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-102","name":"Kunyit Blend","sku":"kunyit blend","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-103","name":"Kunyit Bubuk","sku":"Kunyit Bubuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":1100,"category":"General","supplier":""},
{"id":"ING-104","name":"Kunyit giling","sku":"Kunyitgiling","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-105","name":"Lada Putih","sku":"lada putih","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-106","name":"Laos giling","sku":"Laosgiling","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-107","name":"Lemineral","sku":"lemineral","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-108","name":"Lemon Local","sku":"lemon","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":30,"category":"General","supplier":""},
{"id":"ING-109","name":"Lemon Import","sku":"Lemon Import","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-110","name":"Lemon Juice","sku":"LemonJuice","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-111","name":"Lengkuas","sku":"lengkuas","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-112","name":"Lime","sku":"lime","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-113","name":"Lipton Yellow","sku":"lipton yellow","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-114","name":"Lychee Fruit (sub)","sku":"LycheeFruitsub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-115","name":"Lychee Can","sku":"lychee gr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-116","name":"Lychee Juice (sub)","sku":"LycheeJuicesub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-117","name":"Macaroni","sku":"macaroni","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-118","name":"Macaroni Cooked (sub)","sku":"MacaroniCooked","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-119","name":"Maizena","sku":"maizena","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-120","name":"Margarine","sku":"margarine","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-121","name":"Matcha Powder","sku":"Matcha Powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-122","name":"Mayonnaise","sku":"mayonnaise","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":40,"category":"General","supplier":""},
{"id":"ING-123","name":"Meises","sku":"Meisesgr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-124","name":"Mendoan (sub)","sku":"Mendoansub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-125","name":"Mentai Sauce","sku":"Mentaigr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-126","name":"Micin","sku":"micin","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":52,"category":"General","supplier":""},
{"id":"ING-127","name":"Mie Kriting","sku":"mie keriting","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-128","name":"Mie Cooked","sku":"MieCooked","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-129","name":"Milo","sku":"milo","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-130","name":"Minyak Samin","sku":"Minyak Samin","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-131","name":"Minyak Wijen","sku":"MinyakWijenml","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-132","name":"Mix Kecap (sub)","sku":"mix kecap","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-133","name":"Montega","sku":"montega","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-134","name":"Morin Topping Chocolate","sku":"morin chocolate","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-135","name":"Morin Topping Strawberry","sku":"morin strawberry","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-136","name":"Nanas","sku":"nanas","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-137","name":"Nasgor (sub)","sku":"Nasgorsub","unit":"portion","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-138","name":"Nasi","sku":"nasi putih","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-139","name":"Paha Ayam Filet","sku":"paha ayam filet","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Ayam"},
{"id":"ING-140","name":"Pala Bubuk","sku":"pala bubuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-141","name":"Paprika Bubuk","sku":"paprika bubuk","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-142","name":"Parmesan Powder","sku":"parmesan powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":500,"category":"General","supplier":""},
{"id":"ING-143","name":"Parsley","sku":"Parsley","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-144","name":"Pisang Tanduk","sku":"pisang tanduk","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-145","name":"Pisang Uli","sku":"pisang uli","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-146","name":"Redvelvet Powder","sku":"Redvelvet Powder","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-147","name":"Robusta Blend","sku":"robusta blend","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-148","name":"Robusta Temanggung","sku":"robusta temanggung","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-149","name":"Ronde (sub)","sku":"Rondesub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-150","name":"Roti Tawar","sku":"Roti tawar","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Toko Kue"},
{"id":"ING-151","name":"Sambal Bawang (sub)","sku":"sambalbawang","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-152","name":"Sambal Cireng (sub)","sku":"SambalCirengsub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-153","name":"Santan kara","sku":"santan kara","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-154","name":"Sate Kambing (sub)","sku":"SateKambingsub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-155","name":"Sate Ayam (sub)","sku":"SateAyamsub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-156","name":"Sauce Mantai","sku":"sauce mantai","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-157","name":"Sauce Tiram","sku":"sauce tiram","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-158","name":"Sauce Tomat","sku":"sauce tomate","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-159","name":"Sawi","sku":"sawigr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":11,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-160","name":"Sedotan","sku":"Sedotan","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-161","name":"Selada","sku":"seladagr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":30,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-162","name":"Selai Kacang Buddy Jam","sku":"selai kacang","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-163","name":"Seledri","sku":"seledri","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-164","name":"Sereh","sku":"sereh","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-165","name":"Seres","sku":"seres","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-166","name":"Simple Syrup (sub)","sku":"SimpleSyrupsub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-167","name":"Siomay Ayam (sub)","sku":"SiomayAyamsub","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-168","name":"Skippy","sku":"skippy","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-169","name":"Soft Bread","sku":"soft bread","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Toko Kue"},
{"id":"ING-170","name":"Sop Kambing (sub)","sku":"SopKambingsub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-171","name":"Susu","sku":"susu","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-172","name":"Susu Kental manis Bar","sku":"susu kental manis bar","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-173","name":"Susu Kental manis Dapur","sku":"susu kental manis dapur","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-174","name":"MultiBev - Salted Caramel","sku":"syrup caramel","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-175","name":"Syrup Gula Aren","sku":"Syrup Gula Aren","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-176","name":"MultiBev - Yuzu","sku":"syrup yuzu","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-177","name":"Take away L","sku":"takeawayL","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-178","name":"Take away M","sku":"takeawayM","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-179","name":"Tepung Tapioka","sku":"tapung tapioka","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-180","name":"Teh Gopek","sku":"teh gopek","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-181","name":"Teh Naga","sku":"Teh Naga","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-182","name":"Teh tonji","sku":"Teh tonji","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-183","name":"Telor","sku":"telor","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-184","name":"Tempe","sku":"Tempe","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-185","name":"Tepung Beras","sku":"tepung beras","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-186","name":"Tepung Ketan","sku":"tepung ketan","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-187","name":"Tepung Terigu","sku":"tepung terigu","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-188","name":"Terasi","sku":"terasi","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-189","name":"Thai Tea Leaf","sku":"thai tea leaf","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-190","name":"Thai Tea Base (sub)","sku":"ThaiTeaBasesub","unit":"ml","stock":0,"min_stock":0,"cost_per_unit":0,"category":"Semi-finished","supplier":""},
{"id":"ING-191","name":"Timun","sku":"timun","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-192","name":"Tissu kotak kecil","sku":"tissukotakkecil","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-193","name":"Tissu sedang","sku":"Tissusedang","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-194","name":"Tissu sendok","sku":"tissusendok","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-195","name":"Tomat","sku":"tomat","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-196","name":"Tomat hijau","sku":"Tomathijaugr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":15,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-197","name":"Tray L","sku":"trayL","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-198","name":"Tray M","sku":"trayM","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-199","name":"Tray sambal","sku":"traysambal","unit":"pack","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Rinduh Plastic"},
{"id":"ING-200","name":"Tulang Iga Kambing","sku":"Tulang Iga Kambing","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Daging Kambing"},
{"id":"ING-201","name":"Tulang Kambing","sku":"Tulang Kambing","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Daging Kambing"},
{"id":"ING-202","name":"Tulang Sop","sku":"TulangSopgr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":"Supplier Daging Kambing"},
{"id":"ING-203","name":"Tusuk Sate","sku":"tusuksatepcs","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-204","name":"Wedang Uwuh Pack","sku":"wedang uwuh","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""},
{"id":"ING-205","name":"Wortel","sku":"Wortelgr","unit":"gr","stock":0,"min_stock":0,"cost_per_unit":20,"category":"General","supplier":"Tukang Sayur"},
{"id":"ING-206","name":"Yakult","sku":"Yakult","unit":"pcs","stock":0,"min_stock":0,"cost_per_unit":0,"category":"General","supplier":""}
]

const EMPTY = { name:"", sku:"", unit:"gr", min_stock:0, stock:0, cost_per_unit:0, supplier:"", category:"General" }

export default function InvIngredients() {
  const [ingredients, setIngredients] = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [search,      setSearch]      = useState("")
  const [filter,      setFilter]      = useState("all")
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState(EMPTY)
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [seeding,     setSeeding]     = useState(false)

  useEffect(() => { load() }, [])

  async function load(autoSeed = false) {
    setLoading(true)
    const [{ data:ings }, { data:sups }] = await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("suppliers").select("id,name"),
    ])
    if ((!ings || ings.length === 0) || autoSeed) {
      await supabase.from("ingredients").upsert(INGREDIENT_SEED, { onConflict:"sku", ignoreDuplicates:true })
      const { data:seeded } = await supabase.from("ingredients").select("*").order("name")
      setIngredients(seeded||[])
    } else {
      setIngredients(ings||[])
    }
    setSuppliers(sups||[])
    setLoading(false)
  }

  const lowStock = ingredients.filter(i => i.min_stock > 0 && i.stock <= i.min_stock && i.stock > 0)
  const outStock = ingredients.filter(i => i.stock <= 0)
  const semi     = ingredients.filter(i => i.category === "Semi-finished")

  const filtered = ingredients
    .filter(i => filter==="low" ? lowStock.includes(i) : filter==="out" ? outStock.includes(i) : filter==="semi" ? semi.includes(i) : true)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase()))

  function openAdd()   { setForm(EMPTY); setModal("add") }
  function openEdit(i) { setForm({...i}); setModal("edit") }
  function closeModal(){ setModal(null); setForm(EMPTY) }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const payload = {
      name:          form.name.trim(),
      sku:           form.sku || form.name.toLowerCase().replace(/\s+/g,"-").slice(0,20),
      unit:          form.unit,
      min_stock:     parseFloat(form.min_stock)||0,
      stock:         parseFloat(form.stock)||0,
      cost_per_unit: parseFloat(form.cost_per_unit)||0,
      supplier:      form.supplier||null,
      category:      form.category||"General",
    }
    if (modal==="add") await supabase.from("ingredients").insert({ ...payload, id:"ING-"+Date.now() })
    else await supabase.from("ingredients").update(payload).eq("id", form.id)
    await load(); closeModal(); setSaving(false)
  }

  async function deleteIngredient(id) {
    if (!confirm("Delete this ingredient?")) return
    await supabase.from("ingredients").delete().eq("id", id)
    setIngredients(prev => prev.filter(i => i.id !== id))
    closeModal()
  }

  function stockStatus(i) {
    if (i.stock <= 0)                              return { color:"var(--red)",   label:"Out" }
    if (i.min_stock > 0 && i.stock <= i.min_stock) return { color:"var(--amber)", label:"Low" }
    return { color:"var(--green)", label:"OK" }
  }

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {[["all",`All (${ingredients.length})`],["low",`Low Stock (${lowStock.length})`],["out",`Out of Stock (${outStock.length})`],["semi",`Semi-finished (${semi.length})`]].map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f)} className={"bo-btn bo-btn-sm "+(filter===f?"bo-btn-primary":"bo-btn-ghost")}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--ink5)" }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} className="bo-input" placeholder="Search..." style={{ paddingLeft:28, width:180 }} />
          </div>
          <button onClick={openAdd} className="bo-btn bo-btn-primary">+ Add Ingredient</button>
        </div>
      </div>



      <div className="bo-card" style={{ padding:0, overflow:"hidden" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--ink5)" }}>Loading...</div> : (
          <table className="bo-table">
            <thead>
              <tr><th>Ingredient</th><th>SKU</th><th>Category</th><th>Unit</th><th>Stock</th><th>Min Stock</th><th>Cost / Unit</th><th>Stock Value</th><th>Supplier</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const val = (i.stock||0)*(i.cost_per_unit||0)
                const st  = stockStatus(i)
                return (
                  <tr key={i.id}>
                    <td>
                      <div style={{ fontWeight:700 }}>{i.name}</div>
                      {i.category==="Semi-finished" && <div style={{ fontSize:10, fontWeight:700, color:"#6554C0" }}>SEMI-FINISHED</div>}
                    </td>
                    <td style={{ fontFamily:"monospace", fontSize:11, color:"var(--ink5)" }}>{i.sku||"—"}</td>
                    <td><span className="bo-badge bo-badge-blue">{i.category||"General"}</span></td>
                    <td>{i.unit}</td>
                    <td style={{ fontWeight:700, color:st.color }}>{i.stock||0}</td>
                    <td style={{ color:"var(--ink5)" }}>{i.min_stock||"—"}</td>
                    <td>{i.cost_per_unit>0?fmt(i.cost_per_unit)+"/"+i.unit:<span style={{color:"var(--ink5)"}}>—</span>}</td>
                    <td style={{ fontWeight:600 }}>{val>0?fmt(val):"—"}</td>
                    <td style={{ fontSize:12, color:"var(--ink4)" }}>{i.supplier||"—"}</td>
                    <td><span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10, background:st.color+"22", color:st.color }}>{st.label}</span></td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>openEdit(i)} className="bo-btn bo-btn-ghost bo-btn-sm">Edit</button>
                        <button onClick={()=>deleteIngredient(i.id)} className="bo-btn bo-btn-danger bo-btn-sm">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0 && ingredients.length>0 && <tr><td colSpan={11} style={{ textAlign:"center", color:"var(--ink5)", padding:"32px 0" }}>No ingredients found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="bo-overlay" onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div className="bo-modal">
            <div className="bo-modal-header">
              <div className="bo-modal-title">{modal==="add"?"Add Ingredient":"Edit Ingredient"}</div>
              <button className="bo-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="bo-modal-body">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="bo-input" autoFocus /></div>
                <div><label className="bo-label">SKU</label><input value={form.sku||""} onChange={e=>setForm(f=>({...f,sku:e.target.value}))} className="bo-input" placeholder="Auto if empty" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Base Unit</label>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="bo-select">
                    {UNITS.map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
                <div><label className="bo-label">Category</label>
                  <select value={form.category||"General"} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="bo-select">
                    <option>General</option><option>Semi-finished</option><option>Protein</option><option>Vegetables</option><option>Beverages</option><option>Dry Goods</option><option>Packaging</option><option>Bakery</option>
                  </select>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Current Stock</label><input type="number" value={form.stock||0} onChange={e=>setForm(f=>({...f,stock:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">Min Stock Alert</label><input type="number" value={form.min_stock||0} onChange={e=>setForm(f=>({...f,min_stock:e.target.value}))} className="bo-input" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div><label className="bo-label">Cost per Unit (Rp)</label><input type="number" value={form.cost_per_unit||0} onChange={e=>setForm(f=>({...f,cost_per_unit:e.target.value}))} className="bo-input" /></div>
                <div><label className="bo-label">Supplier</label>
                  <select value={form.supplier||""} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))} className="bo-select">
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="bo-modal-footer">
              <button onClick={closeModal} className="bo-btn bo-btn-ghost">Cancel</button>
              {modal==="edit" && <button onClick={()=>deleteIngredient(form.id)} className="bo-btn bo-btn-danger">Delete</button>}
              <button onClick={save} disabled={saving||!form.name} className="bo-btn bo-btn-primary">{saving?"Saving...":modal==="add"?"Add":"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

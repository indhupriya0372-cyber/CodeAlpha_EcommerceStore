const{DatabaseSync}=require('node:sqlite');
const express=require('express'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
const db=new DatabaseSync('store.db'),SECRET=process.env.JWT_SECRET||'dev-secret-change-me';
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT,description TEXT,price INT,mrp INT,category TEXT,emoji TEXT,rating REAL,reviews INT,stock INT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INT,total INT,address TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(order_id INT,product_id INT,name TEXT,qty INT,price INT);`);
db.exec(`CREATE TABLE IF NOT EXISTS wishlist(user_id INT,product_id INT,PRIMARY KEY(user_id,product_id));
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY,product_id INT,user_id INT,name TEXT,rating INT,text TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);`);
for(const a of["ALTER TABLE users ADD COLUMN is_admin INT DEFAULT 0","ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'Placed'","ALTER TABLE orders ADD COLUMN payment TEXT DEFAULT 'COD'","ALTER TABLE orders ADD COLUMN discount INT DEFAULT 0","ALTER TABLE orders ADD COLUMN shipping INT DEFAULT 0","ALTER TABLE orders ADD COLUMN coupon TEXT"])try{db.exec(a)}catch{}
if(!db.prepare("SELECT 1 FROM users WHERE email='admin@shopkart.com'").get())db.prepare('INSERT INTO users(name,email,password,is_admin) VALUES(?,?,?,1)').run('Admin','admin@shopkart.com',bcrypt.hashSync('admin123',10));

if(!db.prepare('SELECT COUNT(*) c FROM products').get().c){
  const ins=db.prepare('INSERT INTO products(name,description,price,mrp,category,emoji,rating,reviews,stock) VALUES(?,?,?,?,?,?,?,?,?)');
  [['Wireless Headphones','Over-ear Bluetooth headphones with 30-hour battery life and deep bass.',2499,4999,'Electronics','🎧',4.3,12840,25],
   ['Smart Watch','1.8-inch display, heart-rate and sleep tracking, 7-day battery.',3299,6999,'Electronics','⌚',4.1,8120,18],
   ['Bluetooth Speaker','Portable waterproof speaker with 12 hours of playtime.',1799,3499,'Electronics','🔊',4.4,15620,40],
   ['Mechanical Keyboard','Hot-swappable switches, RGB backlight, USB-C cable.',3999,5999,'Electronics','⌨️',4.5,3210,12],
   ['Power Bank 20000mAh','Fast charging, two USB ports and one USB-C port.',1599,2499,'Electronics','🔋',4.2,22400,60],
   ['Running Shoes','Lightweight mesh shoes with cushioned sole for daily runs.',1999,3999,'Fashion','👟',4.0,9340,35],
   ['Denim Jacket','Classic fit denim jacket, 100% cotton.',2199,3999,'Fashion','🧥',4.2,2740,20],
   ['Sunglasses','UV400 polarised lenses with a lightweight frame.',799,1999,'Fashion','🕶️',4.1,6410,50],
   ['Laptop Backpack','25L water-resistant backpack, fits a 15.6-inch laptop.',1299,2499,'Fashion','🎒',4.4,18900,45],
   ['LED Desk Lamp','Dimmable lamp with warm and cool light modes and USB charging.',899,1599,'Home','💡',4.3,5230,30],
   ['Steel Water Bottle','750 ml insulated bottle, keeps drinks cold for 24 hours.',399,799,'Home','🧴',4.6,31200,100],
   ['Ceramic Mug Set','Set of 4 microwave-safe mugs, 300 ml each.',549,999,'Home','☕',4.2,4120,4],
   ['Atomic Habits','Paperback. A practical guide to building good habits.',399,799,'Books','📘',4.8,52300,80],
   ['Clean Code','Paperback. A handbook of agile software craftsmanship.',599,999,'Books','📗',4.7,7600,22],
   ['Dotted Notebook Set','Pack of 3 A5 notebooks, 160 pages each.',249,399,'Books','📓',4.3,3890,0]].forEach(p=>ins.run(...p));
}
const app=express();app.use(express.json(),express.static('public'));
const sign=u=>jwt.sign({id:u.id},SECRET,{expiresIn:'7d'});
const auth=(q,s,n)=>{try{q.uid=jwt.verify((q.headers.authorization||'').slice(7),SECRET).id;n()}catch{s.status(401).json({error:'Please log in'})}};
app.post('/api/register',(q,s)=>{const{name,email,password}=q.body;
  if(!name||!email||(password||'').length<6)return s.status(400).json({error:'Name, email and a password of 6+ characters are required'});
  try{const r=db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,bcrypt.hashSync(password,10));s.json({token:sign({id:Number(r.lastInsertRowid)}),name,admin:false})}
  catch{s.status(400).json({error:'This email is already registered'})}});
app.post('/api/login',(q,s)=>{const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(q.body.email||''));
  if(!u||!bcrypt.compareSync(q.body.password||'',u.password))return s.status(401).json({error:'Wrong email or password'});s.json({token:sign(u),name:u.name,admin:!!u.is_admin})});
const COUPONS={WELCOME200:{type:'flat',v:200,min:999},SAVE10:{type:'pct',v:10,max:500,min:0},FREESHIP:{type:'ship',min:0}};
const STATUS=['Placed','Packed','Shipped','Out for delivery','Delivered'];
const admin=(q,s,n)=>auth(q,s,()=>db.prepare('SELECT is_admin FROM users WHERE id=?').get(q.uid)?.is_admin?n():s.status(403).json({error:'Admin only'}));
function quote(raw,code){const items=[];
  for(const i of raw||[]){const p=db.prepare('SELECT * FROM products WHERE id=?').get(Number(i.id)||0),qty=Math.max(1,parseInt(i.qty)||1);
    if(!p)throw'A product in your cart no longer exists';if(qty>p.stock)throw p.name+': only '+p.stock+' left in stock';items.push({...p,qty})}
  if(!items.length)throw'Your cart is empty';
  const sub=items.reduce((t,i)=>t+i.price*i.qty,0);let shipping=sub>=499?0:40,discount=0,coupon=null;
  if(code){const k=String(code).toUpperCase(),c=COUPONS[k];if(!c)throw'Invalid coupon code';if(sub<c.min)throw'This coupon needs a minimum order of ₹'+c.min;
    coupon=k;if(c.type=='flat')discount=c.v;else if(c.type=='pct')discount=Math.min(Math.round(sub*c.v/100),c.max);else shipping=0}
  return{items,sub,shipping,discount,coupon,total:sub+shipping-discount}}
app.post('/api/quote',(q,s)=>{try{const{sub,shipping,discount,coupon,total}=quote(q.body.items,q.body.code);s.json({sub,shipping,discount,coupon,total})}catch(e){s.status(400).json({error:String(e)})}});
app.get('/api/products',(q,s)=>{let sql='SELECT * FROM products WHERE 1=1';const a=[],{q:t,category:c,sort,minp,maxp,minr,stock}=q.query;
  if(t){sql+=' AND (name LIKE ? OR category LIKE ?)';a.push('%'+t+'%','%'+t+'%')}
  if(c){sql+=' AND category=?';a.push(String(c))}
  if(minp){sql+=' AND price>=?';a.push(Number(minp)||0)}
  if(maxp){sql+=' AND price<=?';a.push(Number(maxp)||0)}
  if(minr){sql+=' AND rating>=?';a.push(Number(minr)||0)}
  if(stock)sql+=' AND stock>0';
  sql+={price_asc:' ORDER BY price',price_desc:' ORDER BY price DESC',rating:' ORDER BY rating DESC'}[sort]||' ORDER BY id';
  s.json(db.prepare(sql).all(...a))});
const wl=u=>db.prepare('SELECT product_id FROM wishlist WHERE user_id=?').all(u).map(r=>r.product_id);
app.get('/api/wishlist',auth,(q,s)=>s.json(wl(q.uid)));
app.post('/api/wishlist/:id',auth,(q,s)=>{const id=Number(q.params.id)||0;
  if(!db.prepare('DELETE FROM wishlist WHERE user_id=? AND product_id=?').run(q.uid,id).changes)db.prepare('INSERT INTO wishlist VALUES(?,?)').run(q.uid,id);s.json(wl(q.uid))});
app.get('/api/products/:id/reviews',(q,s)=>s.json(db.prepare('SELECT name,rating,text,created FROM reviews WHERE product_id=? ORDER BY id DESC').all(Number(q.params.id)||0)));
app.post('/api/products/:id/reviews',auth,(q,s)=>{const id=Number(q.params.id)||0,r=Math.min(5,Math.max(1,parseInt(q.body.rating)||1)),t=String(q.body.text||'').trim().slice(0,300);
  if(!db.prepare('SELECT 1 FROM products WHERE id=?').get(id))return s.status(404).json({error:'Product not found'});
  if(!t)return s.status(400).json({error:'Write a short review first'});
  if(db.prepare('SELECT 1 FROM reviews WHERE product_id=? AND user_id=?').get(id,q.uid))return s.status(400).json({error:'You already reviewed this product'});
  db.prepare('INSERT INTO reviews(product_id,user_id,name,rating,text) VALUES(?,?,?,?,?)').run(id,q.uid,db.prepare('SELECT name FROM users WHERE id=?').get(q.uid).name,r,t);
  db.prepare('UPDATE products SET rating=ROUND((rating*reviews+?)/(reviews+1),1),reviews=reviews+1 WHERE id=?').run(r,id);s.json({ok:1})});
app.post('/api/orders',auth,(q,s)=>{
  const a=q.body.address||{},pay=['COD','UPI','Card'].includes(q.body.payment)?q.body.payment:'COD';
  if(!a.name||!/^\d{10}$/.test(a.phone)||!a.address||!a.city||!/^\d{6}$/.test(a.pin))return s.status(400).json({error:'Enter a valid name, 10-digit phone, address, city and 6-digit pincode'});
  let qt;try{qt=quote(q.body.items,q.body.coupon)}catch(e){return s.status(400).json({error:String(e)})}
  db.exec('BEGIN');
  try{const o=db.prepare('INSERT INTO orders(user_id,total,address,payment,discount,shipping,coupon) VALUES(?,?,?,?,?,?,?)').run(q.uid,qt.total,JSON.stringify({name:a.name,phone:a.phone,address:a.address,city:a.city,pin:a.pin}),pay,qt.discount,qt.shipping,qt.coupon);
    for(const i of qt.items){db.prepare('INSERT INTO order_items VALUES(?,?,?,?,?)').run(o.lastInsertRowid,i.id,i.name,i.qty,i.price);
      db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.qty,i.id)}
    db.exec('COMMIT');s.json({orderId:Number(o.lastInsertRowid)})}
  catch{db.exec('ROLLBACK');s.status(500).json({error:'Could not place order'})}});
const withItems=os=>os.map(o=>({...o,address:JSON.parse(o.address),items:db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id)}));
app.get('/api/orders',auth,(q,s)=>s.json(withItems(db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(q.uid))));
app.post('/api/orders/:id/cancel',auth,(q,s)=>{const o=db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(Number(q.params.id)||0,q.uid);
  if(!o)return s.status(404).json({error:'Order not found'});
  if(o.status!='Placed')return s.status(400).json({error:'Only orders that are not yet packed can be cancelled'});
  db.exec('BEGIN');
  for(const i of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id))db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty,i.product_id);
  db.prepare("UPDATE orders SET status='Cancelled' WHERE id=?").run(o.id);db.exec('COMMIT');s.json({ok:1})});
app.get('/api/admin/stats',admin,(q,s)=>{const c=t=>db.prepare('SELECT COUNT(*) c FROM '+t).get().c;
  s.json({orders:c('orders'),products:c('products'),users:c('users WHERE is_admin=0'),revenue:db.prepare("SELECT COALESCE(SUM(total),0) t FROM orders WHERE status!='Cancelled'").get().t})});
app.get('/api/admin/orders',admin,(q,s)=>s.json(withItems(db.prepare('SELECT o.*,u.name customer FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC').all())));
app.put('/api/admin/orders/:id',admin,(q,s)=>{if(![...STATUS,'Cancelled'].includes(q.body.status))return s.status(400).json({error:'Invalid status'});
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(q.body.status,Number(q.params.id)||0);s.json({ok:1})});
app.post('/api/admin/products',admin,(q,s)=>{const b=q.body,price=Math.round(b.price),mrp=Math.round(b.mrp)||price;
  if(!b.name||!(price>0))return s.status(400).json({error:'Name and a price above 0 are required'});
  db.prepare('INSERT INTO products(name,description,price,mrp,category,emoji,rating,reviews,stock) VALUES(?,?,?,?,?,?,?,?,?)').run(String(b.name),String(b.description||''),price,Math.max(mrp,price),String(b.category||'Home'),String(b.emoji||'📦'),4,0,Math.max(0,parseInt(b.stock)||0));s.json({ok:1})});
app.put('/api/admin/products/:id',admin,(q,s)=>{const price=Math.round(q.body.price);if(!(price>0))return s.status(400).json({error:'Enter a valid price'});
  db.prepare('UPDATE products SET price=?,stock=?,mrp=MAX(mrp,?) WHERE id=?').run(price,Math.max(0,parseInt(q.body.stock)||0),price,Number(q.params.id)||0);s.json({ok:1})});
app.delete('/api/admin/products/:id',admin,(q,s)=>{db.prepare('DELETE FROM products WHERE id=?').run(Number(q.params.id)||0);s.json({ok:1})});
app.listen(3000,()=>console.log('Running on http://localhost:3000'));

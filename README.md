# CodeAlpha_EcommerceStore (ShopKart)
Full-stack e-commerce website inspired by Amazon/Flipkart.

## Features
- User registration/login (JWT + bcrypt), separate login/sign-up page
- Product listing with categories, search, sort, price/rating/in-stock filters
- Product details page, ratings and reviews, similar products, recently viewed
- Wishlist (saved per user)
- Shopping cart with quantity control and stock checks
- Coupon codes (WELCOME200, SAVE10, FREESHIP) and delivery charges
- Checkout with saved address and payment method (demo)
- Order history with live status tracker, cancel order, print invoice
- Admin panel: dashboard stats, add/edit/delete products, update order status
- Dark mode

**Stack:** HTML/CSS/JavaScript, Node.js (Express), SQLite (built-in `node:sqlite`, Node 22.5+)

## Run
```
npm install
npm start
```
Open http://localhost:3000. Demo admin: admin@shopkart.com / admin123 (change before real use).

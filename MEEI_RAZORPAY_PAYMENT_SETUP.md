# MEEi Razorpay Payments

## Provider decision
Razorpay is the selected payment gateway for MEEi Diamond top-ups. Use Razorpay Checkout/hosted payment flow so UPI PIN, OTP, card number and CVV are entered only in the bank/UPI app or Razorpay-controlled checkout, never in MEEi.

## Required architecture
- Create Razorpay Orders only from an authenticated Supabase Edge Function. The server calculates the amount from an admin-controlled Diamond pack catalogue and GST configuration; never trust a client-supplied amount or Diamond quantity.
- Keep Razorpay Key Secret and Webhook Secret only in Supabase Edge Function secrets. The mobile app may receive only the public Key ID and the server-created order ID.
- Verify the Checkout payment signature on the server and independently verify the payment/order status with Razorpay before crediting Diamonds.
- Also process Razorpay webhooks with signature verification against the raw request body. Handle duplicate and out-of-order webhook deliveries safely.
- Credit Diamonds through one atomic database transaction/RPC with a unique constraint on the Razorpay payment ID/order entitlement. A payment must never credit twice.
- Never credit Diamonds from the client success callback alone. The callback should immediately ask the backend for the authoritative status.
- Use Supabase Realtime or a short bounded status poll as a fallback while the payment is processing. Stop polling on a terminal state; provide a manual refresh option.
- Store an auditable payment record with internal user ID, order ID, payment ID, amount, currency, pack ID, provider status, timestamps and verification outcome. Do not store UPI PIN, OTP, CVV or full card data.

## Customer-facing payment states
1. `created` / checkout not yet completed: **Payment not completed yet**.
2. Provider confirms UPI/bank processing or pending: **Bank/UPI confirmation pending**. Explain that the bank/UPI network has not sent final confirmation yet; Diamonds will be added automatically after verified success. Tell the user not to pay again while this order is pending.
3. `authorized` but not captured/settled where applicable: **Payment received, final confirmation pending**. Do not credit until the configured capture/verified-success condition is met.
4. Verified captured/success: **Payment successful** and credit Diamonds exactly once.
5. Verified failed: **Payment failed**; no Diamonds credited. Allow a new attempt only after the old order is terminal.
6. Unknown / delayed webhook / temporary network issue: **Confirmation is taking longer than usual**. Keep checking the same order; do not label it as a bank delay unless the provider status actually indicates bank/UPI pending.

Suggested pending copy:
“Your payment is awaiting confirmation from your bank/UPI network. MEEi has not received the final confirmation yet. Diamonds will be added automatically once the payment is verified. Please do not make another payment for this order.”

Hindi:
“आपका पेमेंट बैंक/UPI नेटवर्क से कन्फर्म होने का इंतज़ार कर रहा है। अभी MEEi को फाइनल कन्फर्मेशन नहीं मिला है। पेमेंट सफलतापूर्वक वेरिफ़ाई होते ही Diamonds अपने-आप जुड़ जाएंगे। कृपया इसी ऑर्डर के लिए दोबारा पेमेंट न करें।”

## Speed and reliability
- Acknowledge webhook requests quickly after signature validation and durable enqueue/recording; perform entitlement crediting idempotently.
- The app should show the backend's latest order state immediately after checkout returns and subscribe to Realtime updates. Use a short-interval fallback status check only while pending.
- Target near-real-time confirmation under normal gateway/bank conditions; never promise a fixed number of seconds because bank/UPI networks and provider callbacks can be delayed.
- If webhook delivery is delayed, a server-side status reconciliation job/API check must recover the final state.
- A pending payment must not be marked failed just because a client timeout or app close occurred.

## Before production
- Create/activate the MEEi Razorpay merchant account and complete required KYC/UPI activation.
- Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` as Supabase Edge Function secrets (never commit values to GitHub or put secrets in the app).
- Configure the Razorpay webhook endpoint and subscribe to the relevant order/payment events after implementing the Edge Functions.
- Test success, pending, delayed webhook, duplicate webhook, failed, cancelled, app-killed-during-checkout, and refund/reversal cases in test mode before enabling live payments.
- Confirm Razorpay's current UPI payment method and merchant eligibility requirements before launch.

## Payment-status language and translation
- Render every payment status, explanatory sentence, button label and payment error in the user's selected MEEi app language. Use the app language preference; if none is set, use the device locale when supported, otherwise fall back to English.
- Provide a **Translate to English** text button directly below the payment-status message whenever the displayed language is not English. Tapping it translates the complete visible status message into English without changing the underlying payment state or order.
- After translation, change the button label to **Show in [user language]** so the user can switch back. Keep the original language preference unchanged.
- Use reviewed localization strings for payment-critical wording (especially pending, successful, failed and “do not pay again”) rather than relying on an unreviewed live translation that could change the meaning. If a language is not yet supported, show the complete message in English.
- Keep dynamic values such as payment reference, amount and timestamp unchanged while translating surrounding text. Never translate provider status codes or alter the authoritative status returned by the backend.
- Example Hindi pending message:
  “आपका पेमेंट बैंक/UPI नेटवर्क से कन्फर्म होने का इंतज़ार कर रहा है। अभी MEEi को फाइनल कन्फर्मेशन नहीं मिला है। पेमेंट सफलतापूर्वक वेरिफ़ाई होते ही Diamonds अपने-आप जुड़ जाएंगे। कृपया इसी ऑर्डर के लिए दोबारा पेमेंट न करें।”
  Directly below it show **Translate to English**.
- Example English pending message:
  “Your payment is awaiting confirmation from your bank/UPI network. MEEi has not received the final confirmation yet. Diamonds will be added automatically once the payment is verified. Please do not make another payment for this order.”

# Phone verification (inbound SMS)

Students confirm a number by **texting us**, not by receiving a text. Nothing is
sent by the server, so no SMS provider is billed. The student pays for one
ordinary SMS.

## How it works

1. The student types a number and taps **Verify**.
2. `POST /api/users/me/phone/begin` stages the number as *pending* and returns a
   six-digit code, the gateway number, and the exact message to send.
3. The app shows an `sms:` link. One tap opens their messaging app, addressed to
   the gateway with the message already filled in.
4. They send it. The gateway — an Android handset with a SIM — receives the SMS
   and posts it to `POST /api/webhooks/sms/inbound`.
5. The server matches the sender to a pending verification, checks the code, and
   marks the number verified. The app is polling `/api/users/me/phone/status`
   and flips to **Verified** within a few seconds.

## Why there is no "enter the code" box

The code is displayed on the student's own screen. Accepting it back through the
API would verify any number for anyone who asked — they already know the code.

**The proof is the sender's caller ID, not the secrecy of the code.** The code
only says which pending verification an incoming message belongs to. This is why
`POST /api/users/me/phone/verify` was removed rather than kept as a fallback: a
fallback here is a bypass. If an outbound provider is ever added, a typed code
becomes meaningful again and can come back with it.

## Configuration

Both in `.env`, read by `docker-compose.prod.yml`:

```
CAMPUSMARKET_SMS_GATEWAY_NUMBER=+260XXXXXXXXX
CAMPUSMARKET_SMS_INBOUND_SECRET=<64 hex characters>
```

Generate the secret with:

```
openssl rand -hex 32
```

Leaving `CAMPUSMARKET_SMS_GATEWAY_NUMBER` blank disables verification and says
so, rather than offering a flow that cannot finish.

Leaving `CAMPUSMARKET_SMS_INBOUND_SECRET` blank makes the webhook **reject every
call**. This is deliberate and is the most important setting here: the endpoint
cannot sit behind a session, because a handset has no login, so the secret is
the only thing protecting it. Anyone who can post to it unchecked can mark any
number on the site as verified.

## Setting up the gateway handset

Any Android phone that stays plugged in and on wifi will do.

1. Put a SIM in it. The number on that SIM is `CAMPUSMARKET_SMS_GATEWAY_NUMBER`.
   Receiving SMS is free on every Zambian network; the phone never sends.
2. Install an SMS-forwarding app that can POST incoming messages to a URL with a
   custom header.
3. Point it at `https://<api-host>/api/webhooks/sms/inbound` with:
   - Header: `Authorization: Bearer <CAMPUSMARKET_SMS_INBOUND_SECRET>`
   - JSON body containing the sender and the text:
     ```json
     { "from": "{{sender}}", "body": "{{message}}" }
     ```
   The placeholder names differ per app; what matters is that `from` is the
   sender as **the network reported it**, never anything from the message body.
   The sender is the thing being proven.
4. Disable battery optimisation for the app, and leave the phone charging.

### Checking it

```
curl -X POST https://<api-host>/api/webhooks/sms/inbound \
  -H 'Authorization: Bearer <secret>' \
  -H 'content-type: application/json' \
  -d '{"from":"+260971234567","body":"CampusMarket 123456"}'
```

Always answers `{"received":true}`, whatever happened — a gateway cannot act on
the difference, and an endpoint that reported "no verification pending for that
number" would be a way to ask which numbers are mid-signup. Check the API log
for `Phone verified by inbound message from …`.

## Things worth knowing

- **Number formats are reconciled by the last nine digits.** A student types
  `0971234567`; the network reports `+260971234567`. Same line, different
  strings. An equality match on the stored column would silently never match —
  this is the single easiest way to break this feature.
- **Codes expire after 10 minutes**, allow 5 non-matching messages, and can be
  re-issued once a minute.
- **The handset is a single point of failure.** If it is off, verifications
  never complete; the student sees the code expire and can retry. Worth a
  periodic check that it is online.
- **Carriers may notice a consumer SIM receiving bulk application traffic.**
  Receiving is far less likely to be flagged than sending, which is part of why
  inbound is the cheaper and quieter direction.
- **Rate limiting**: the webhook is an ordinary POST, so it falls under
  `rate-limit-write-per-minute` (120) per IP. Every message arrives from the one
  gateway IP, so that ceiling is shared — ample at campus scale, but it is the
  number to raise if verifications start failing in bursts.

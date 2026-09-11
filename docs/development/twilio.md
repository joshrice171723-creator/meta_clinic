# Twilio setup

APPly uses separate Twilio configuration boundaries for video visits and patient-portal password recovery. Selecting Twilio in source does not enable either workflow by itself. Keep every credential in the process environment or an approved secret store; never place it in Git, screenshots, notes or support messages. For local development only, `bin/dev` loads the allowlisted Twilio variables from the ignored root `.env.twilio.local` file into the API and worker processes; it never forwards arbitrary environment entries from that file or exposes them to the frontend process.

## Telehealth video

Twilio Video is the default media adapter. Enable it only after the clinic's telehealth policy, eligible visit type and clinician readiness are configured.

```text
APP_TELEHEALTH_ENABLED=true
APP_TELEHEALTH_PROVIDER=twilio
APP_TELEHEALTH_TWILIO_ACCOUNT_SID=AC...
APP_TELEHEALTH_TWILIO_API_KEY_SID=SK...
APP_TELEHEALTH_TWILIO_API_KEY_SECRET=<secret-store value>
APP_TELEHEALTH_TWILIO_AUTH_TOKEN=<secret-store value>
APP_TELEHEALTH_TWILIO_STATUS_CALLBACK_URL=https://<public-api-host>/api/integrations/telehealth/twilio/events
```

The API key signs short-lived participant grants and calls the Video REST API. The Account Auth Token is reserved for validating Twilio callback signatures. The callback must be one exact public HTTPS URL. The scheduling and join surfaces remain closed when any prerequisite is missing or provider health is not ready.

## Password-recovery SMS

Use a separate Restricted Twilio API key with permission to create Messaging messages. Configure either a Messaging Service SID or one owned SMS-capable sender number.

```text
APP_PATIENT_PORTAL_RECOVERY_SMS_ENABLED=true
APP_PATIENT_PORTAL_RECOVERY_ORIGIN=https://<app-host>
APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID=AC...
APP_PATIENT_PORTAL_TWILIO_API_KEY_SID=SK...
APP_PATIENT_PORTAL_TWILIO_API_KEY_SECRET=<secret-store value>
APP_PATIENT_PORTAL_TWILIO_MESSAGING_SERVICE_SID=MG...
```

To use a specific sender instead of a Messaging Service:

```text
APP_PATIENT_PORTAL_TWILIO_FROM_NUMBER=+1...
```

The reset link expires after 30 minutes and is replaced by any later recovery request. The public endpoint never reports whether an email address, patient, mobile number or Twilio configuration matched. Delivery is processed by `bin/clinic-worker`; a timed-out or interrupted send is marked unknown and is not automatically duplicated.

For a local non-delivery Twilio API check, omit the APPly recovery Account SID and API key variables, then provide `TWILIO_TEST_ACCOUNT_SID` and `TWILIO_TEST_AUTH_TOKEN`. Twilio test credentials validate the Messages API request with the documented magic sender but do not contact a handset or emit delivery callbacks. Authorized local development still shows the short-lived secure reset continuation so a tester can finish the workflow. A real SMS requires a separately authorized recipient, live Twilio credentials and any applicable messaging registration or sender approval.

## Clinic-owner invitation SMS

The Owner Command Center can send the one-time clinic-owner activation link by email or text message. The owner account still requires an email address; a mobile number is used only for delivery and is not retained with the invitation. Text delivery is disabled in the Command Center until these server-only values are present:

```text
APP_PLATFORM_INVITATION_SMS_ENABLED=true
APP_PLATFORM_TWILIO_ACCOUNT_SID=AC...
APP_PLATFORM_TWILIO_API_KEY_SID=SK...
APP_PLATFORM_TWILIO_API_KEY_SECRET=<secret-store value>
APP_PLATFORM_TWILIO_MESSAGING_SERVICE_SID=MG...
```

Alternatively, configure `APP_PLATFORM_TWILIO_FROM_NUMBER=+1...` instead of a Messaging Service. Use a Twilio restricted API key that can create Messaging messages and an approved sender. A successful Twilio API acceptance returns no activation URL to the browser; an unavailable or rejected sender leaves the existing private recovery link available to the platform owner so the invitation is not lost.

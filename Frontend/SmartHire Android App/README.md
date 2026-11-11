# SmartHire (Candidate Android App)

Package: `com.bnp.paribas` · Kotlin + Jetpack Compose · Light mode only · minSdk 26

## Run
1. Open this folder in Android Studio (Ladybug or newer). It will download Gradle 8.9 and sync.
2. Copy your Firebase client config to `app/google-services.json`
   (from `/Users/mohammadsadiq/.fastapi-cli/firebase/google-services.json`).
   The app builds without it, but push notifications stay disabled.
3. Run on a device or emulator.

## Security
- NEVER put `firebase-service-account.json` in this project. It is backend-only.
- `.gitignore` already excludes it and `app/google-services.json`.
- The FCM token is stored locally only; it is not sent to the backend (no endpoint exists in the contract).

## Notes
- Base URL is defined once in `core/network/Net.kt` (`ApiConfig.BASE_URL`).
- Backend response field names are mapped defensively in `data/models/Mappers.kt`; adjust there if a field differs.
- Exam timer appears only if the backend returns timing fields.

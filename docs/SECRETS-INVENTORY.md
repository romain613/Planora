# SECRETS-INVENTORY — PLANORA

> Inventaire des secrets actuels en prod. **Aucune valeur en clair** — uniquement noms + emplacement + rotation policy.
> Source : Audit 13 §3.6 + Audit 14 §3.6

## Localisation principale

```
/var/www/planora/server/.env   (sur VPS, chmod 640 root:root)
```

Permissions : `chmod 600` recommandé (Phase 4+).

## Inventaire

| Secret | Variable env | Usage | Provider | Rotation | Plan B |
|---|---|---|---|---|---|
| Twilio Account SID | `TWILIO_ACCOUNT_SID` | Voice + SMS | Twilio | Annuel | Provider Engine multi-adapter Phase 4+ |
| Twilio Auth Token | `TWILIO_AUTH_TOKEN` | Voice + SMS | Twilio | Annuel | idem |
| Twilio API Key | `TWILIO_API_KEY_SID` | API Key v2 | Twilio | Annuel | idem |
| Twilio API Secret | `TWILIO_API_KEY_SECRET` | API Key v2 | Twilio | Annuel | idem |
| Google Client ID | `GOOGLE_CLIENT_ID` | OAuth Google | Google Cloud | 2 ans | - |
| Google Client Secret | `GOOGLE_CLIENT_SECRET` | OAuth Google | Google Cloud | 2 ans | - |
| Microsoft Client ID | `MICROSOFT_CLIENT_ID` | OAuth Outlook | Azure AD | 2 ans | - |
| Microsoft Client Secret | `MICROSOFT_CLIENT_SECRET` | OAuth Outlook | Azure AD | 2 ans | - |
| Resend API Key | `RESEND_API_KEY` | Email (SMS confirmations) | Resend | 1 an | SMTP fallback Phase 4+ |
| OpenAI API Key | `OPENAI_API_KEY` | IA Copilot | OpenAI | 1 an | Anthropic/Mistral Phase 4+ |
| JWT Secret | `JWT_SECRET` | Auth tokens | Local | Rotation = invalide sessions | - |
| Session Secret | `SESSION_SECRET` | Cookies session | Local | Rotation = invalide sessions | - |

## Variables non-secret (config publique)

| Variable | Usage |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DB_PATH` | `/var/www/planora-data/calendar360.db` |
| `CONTROL_TOWER_PATH` | `/var/www/planora-data/control_tower.db` |
| `TENANTS_DIR` | `/var/www/planora-data/tenants` |
| `STORAGE_DIR` | `/var/www/planora-data/storage` |

## Règles secrets

### Phase 1 (actuelle)
- ❌ **Aucun nouveau secret ajouté Phase 1** (Provider Engine wraps existant)
- ❌ **Jamais hardcodé** dans le code (test anti-leak hardcoded-secrets bloque)
- ❌ **Jamais commité** dans Git (`.gitignore` + pre-commit hook bloque)
- ❌ **Jamais loggué** (futur pino redact list, Sprint 2)
- ✅ Lecture via `process.env.*` uniquement
- ✅ `MOCK_ADAPTER_ENABLED=true` pour tests sans secret

### Phase 4+ (futur)
- Vault HashiCorp ou AWS Secrets Manager
- Rotation automatique
- MFA SUPRA admin
- Audit logs accès secrets
- Chiffrement column-level en DB (`supro_secrets` table)

## Rotation procedure (Phase 4+)

Pour chaque secret :
1. Générer nouveau secret côté provider
2. Test en parallèle (rolling rotation possible ?)
3. Update `/var/www/planora/server/.env` (backup avant)
4. `pm2 restart calendar360` (downtime ~10s)
5. Vérification fonctionnelle (call test, email test)
6. Révoquer ancien secret côté provider
7. Documentation rotation dans `INCIDENTS/ROTATION-YYYYMMDD-<secret>.md`

## En cas de leak suspect

### Si secret leaké détecté (logs, screenshot, commit Git accidentel)

1. **STOP immédiat** — escalade MH
2. **Révoquer** côté provider (Twilio Console / Google Cloud / etc.)
3. **Générer nouveau** secret immédiatement
4. **Update** `.env` + restart PM2
5. **Audit forensic** : qui a vu, quand, où le secret a fuité
6. **Documentation** dans `INCIDENTS/INC-YYYYMMDD-LEAK-<secret>.md`
7. **Notification** clients si potentiellement compromettant données (RGPD 72h)

## Ownership

| Secret | Owner | Backup contact |
|---|---|---|
| Tous les secrets prod | MH (`rc.sitbon@gmail.com`) | À définir (data eng onboarding) |
| Twilio account | MH | - |
| Google OAuth | MH | - |
| Microsoft OAuth | MH | - |

## Accès secret

| Méthode | Qui | Quand |
|---|---|---|
| SSH `/var/www/planora/server/.env` | MH seul | Read si nécessaire |
| Provider dashboard | MH seul (MFA Phase 3+) | Rotation, audit |
| Backup baseline configs | MH seul | DR uniquement |

## Phase 5+ — Compliance

- Audit accès secrets
- Rotation auto trimestrielle
- SIEM aggregation
- ARCEP compliance (si telecom certified)
- RGPD compliance (DPO designated)

## Référence

- Audit 13 §3.6 — Secrets management
- Audit 14 §3.6 — Secrets en clair (à durcir Phase 5+)
- Audit 14 §11.1 R-10 — Risque secrets fuités via logs

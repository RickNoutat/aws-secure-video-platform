# AWS Secure Video Streaming Platform

> Plateforme de streaming vidéo sécurisée, 100% serverless, déployée sur AWS.

## Présentation

Cette application permet à des utilisateurs authentifiés de **téléverser**, **consulter** et **lire** leurs vidéos directement depuis un site web statique. Le tout repose sur une architecture **serverless moderne** entièrement déployée sur **AWS**.

### Fonctionnalités

- **Authentification sécurisée** via Amazon Cognito (OAuth2)
- **Upload de vidéos** via des URLs signées (pre-signed URLs)
- **Liste des vidéos** avec métadonnées stockées en base de données
- **Lecture sécurisée** via CloudFront (URLs signées temporaires)
- **Frontend SPA** statique hébergé sur S3, distribué via CloudFront

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Utilisateur │────▶│  CloudFront  │────▶│  Bucket S3 Vidéos│
│     Web      │     │ (accès public│     │ (accès restreint)│
│              │     │  lecture)    │     │                  │
└──────┬───────┘     └──────────────┘     └──────────────────┘
       │
       │ (auth via Cognito)
       ▼
┌──────────────┐     ┌──────────────────┐
│  SPA hébergée│◀────│  Bucket S3 SPA   │
│  (navigateur)│     │  (via CloudFront)│
└──────┬───────┘     └──────────────────┘
       │
       │ (requêtes signées)
       ▼
┌──────────────────────┐
│     API Gateway      │
│ POST /generate-upload│
│ GET  /list-videos    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────┐     ┌─────────────────────┐
│ Lambda Functions │◀───▶│ Secrets Manager / RDS│
│ - URL signée     │     │ (métadonnées)        │
│ - Insertion S3→RDS│     └─────────────────────┘
│ - Liste vidéos   │
└──────────┬───────┘
           │
           ▼
┌──────────────────────┐
│     VPC Privée       │
│  (Lambda, RDS, etc.) │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│     NAT Gateway      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Internet Gateway   │
└──────────────────────┘
```

## Stack Technique

| Service | Rôle |
|---------|------|
| **Amazon S3** | Stockage des vidéos + hébergement SPA |
| **Amazon CloudFront** | CDN pour la distribution des vidéos et du site |
| **Amazon Cognito** | Authentification OAuth2 (User Pool) |
| **API Gateway HTTP** | Exposition des endpoints REST sécurisés |
| **AWS Lambda** | Logique métier (Node.js 20) |
| **Amazon RDS** (PostgreSQL) | Stockage des métadonnées vidéos |
| **AWS Secrets Manager** | Gestion sécurisée des credentials DB |
| **VPC** | Isolation réseau (subnets privés/publics) |
| **NAT Gateway** | Accès internet sortant pour les Lambda en VPC |

## Structure du Projet

```
aws-secure-video-platform/
├── infrastructure/
│   ├── template.yaml              # Template SAM (CloudFormation)
│   └── parameters/
│       ├── dev.json.example       # Exemple de paramètres dev
│       └── prod.json.example      # Exemple de paramètres prod
├── backend/
│   ├── functions/
│   │   ├── generate-upload-url/   # Lambda: génération URL signée upload
│   │   ├── list-videos/           # Lambda: liste des vidéos
│   │   └── process-video/         # Lambda: traitement post-upload (S3 trigger)
│   └── shared/
│       └── db.mjs                 # Module partagé connexion DB
├── frontend/
│   ├── index.html                 # SPA principale
│   ├── css/styles.css
│   └── js/
│       ├── app.mjs                # Point d'entrée application
│       ├── auth.mjs               # Module authentification Cognito
│       ├── api.mjs                # Module appels API
│       └── player.mjs             # Module lecteur vidéo
├── scripts/
│   ├── deploy.sh                  # Script de déploiement complet
│   ├── setup-db.sql               # Script d'initialisation de la BDD
│   └── sync-frontend.sh           # Déploiement du frontend vers S3
├── samconfig.toml                 # Configuration SAM CLI
└── README.md
```

---

## Déploiement en Production

### Prérequis

Avant de commencer, installe et configure les outils suivants :

```bash
# AWS CLI v2
brew install awscli        # macOS
# ou https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

# AWS SAM CLI
brew tap aws/tap
brew install aws-sam-cli

# Node.js 20+
node --version             # vérifier la version installée

# Docker (requis par sam build --use-container)
brew install --cask docker
```

Configure ton compte AWS :

```bash
aws configure
# AWS Access Key ID: <ta clé>
# AWS Secret Access Key: <ton secret>
# Default region name: eu-west-1
# Default output format: json
```

> Ton utilisateur IAM doit avoir les permissions pour créer : VPC, EC2, S3, CloudFront, Cognito, Lambda, API Gateway, RDS, Secrets Manager, IAM roles.

---

### Étape 1 — Générer une paire de clés RSA pour CloudFront

CloudFront utilise des **URLs signées** pour protéger l'accès aux vidéos. Cela nécessite une paire de clés RSA.

```bash
# Générer la clé privée
openssl genrsa -out cloudfront_private_key.pem 2048

# Extraire la clé publique
openssl rsa -pubout -in cloudfront_private_key.pem -out cloudfront_public_key.pem

# Afficher la clé publique (tu en auras besoin à l'étape 3)
cat cloudfront_public_key.pem
```

> **Important** : conserve `cloudfront_private_key.pem` en lieu sûr. Elle sera utilisée par la Lambda `list-videos` pour signer les URLs. Ne la committe jamais dans git.

---

### Étape 2 — Configurer les paramètres de déploiement

```bash
# Copier les fichiers de configuration
cp infrastructure/parameters/dev.json.example infrastructure/parameters/dev.json
cp samconfig.toml.example samconfig.toml
```

Édite `infrastructure/parameters/dev.json` :

```json
{
  "Parameters": {
    "Environment": "dev",
    "ProjectName": "secure-video-platform",
    "DBInstanceClass": "db.t3.micro",
    "DBName": "videodb",
    "DBMasterUsername": "admin",
    "DBMasterPassword": "UnMotDePasseForte12!",
    "CognitoDomainPrefix": "mon-app-video-dev"
  }
}
```

> `CognitoDomainPrefix` doit être **unique sur toute la région AWS** (ex: `prenom-video-platform-dev`).

---

### Étape 3 — Injecter la clé publique CloudFront dans le template

Ouvre `infrastructure/template.yaml` et remplace `REPLACE_WITH_YOUR_PUBLIC_KEY_PEM` par le contenu de ta clé publique :

```yaml
CloudFrontPublicKey:
  Type: AWS::CloudFront::PublicKey
  Properties:
    PublicKeyConfig:
      Name: !Sub "${ProjectName}-public-key"
      CallerReference: !Sub "${ProjectName}-${Environment}"
      EncodedKey: |
        -----BEGIN PUBLIC KEY-----
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
        -----END PUBLIC KEY-----
```

---

### Étape 4 — Déployer l'infrastructure AWS

Lance le script de déploiement complet (build SAM + déploiement CloudFormation + sync frontend) :

```bash
bash scripts/deploy.sh dev
```

Ce script effectue dans l'ordre :
1. Vérifie que AWS CLI et SAM CLI sont installés
2. Installe les dépendances npm des Lambdas
3. Build le projet SAM (`sam build`)
4. Déploie le stack CloudFormation (`sam deploy`)
5. Synchronise le frontend vers S3

La première exécution prend environ **15 à 20 minutes** (création du VPC, RDS, CloudFront).

À la fin, le script affiche un tableau des **outputs** du stack :

```
---------------------------------------------------------------------
|                        DescribeStacks                             |
+---------------------------+---------------------------------------+
| ApiEndpoint               | https://abc123.execute-api.eu-west-1… |
| CognitoDomain             | https://mon-app-video-dev.auth.eu-…   |
| FrontendUrl               | https://d1234abcd.cloudfront.net      |
| RDSEndpoint               | secure-video-platform-db-dev.xxx.rds… |
| UserPoolId                | eu-west-1_XXXXXXXXX                   |
| UserPoolClientId          | XXXXXXXXXXXXXXXXXXXXXXXXXX            |
+---------------------------+---------------------------------------+
```

Sauvegarde ces valeurs, tu en auras besoin dans les étapes suivantes.

---

### Étape 5 — Initialiser la base de données

La base de données RDS est dans un subnet privé. Pour y accéder, utilise **AWS Systems Manager Session Manager** (sans bastion, sans port ouvert) :

```bash
# Installer le plugin SSM pour AWS CLI
brew install --cask session-manager-plugin

# Lancer un tunnel vers RDS via une instance EC2 (ou utiliser un Lambda temporaire)
# Alternative simple : utiliser AWS CloudShell depuis la console AWS
```

Depuis AWS CloudShell (ou une instance EC2 dans le même VPC) :

```bash
psql -h <RDSEndpoint> -U admin -d videodb -f scripts/setup-db.sql
```

Cela crée la table `videos` avec ses index et triggers.

---

### Étape 6 — Stocker la clé privée CloudFront dans Secrets Manager

La Lambda `list-videos` a besoin de la clé privée pour signer les URLs vidéos :

```bash
aws secretsmanager create-secret \
  --name "secure-video-platform/cloudfront-private-key/dev" \
  --secret-string file://cloudfront_private_key.pem \
  --region eu-west-1
```

Puis mets à jour la Lambda pour qu'elle lise ce secret (ajoute la variable d'environnement `CLOUDFRONT_PRIVATE_KEY_SECRET_ARN` dans `template.yaml`).

---

### Étape 7 — Configurer le frontend avec les outputs du stack

Édite `frontend/js/auth.mjs` avec les valeurs Cognito :

```javascript
const CONFIG = {
  cognitoDomain: "mon-app-video-dev.auth.eu-west-1.amazoncognito.com",
  clientId: "XXXXXXXXXXXXXXXXXXXXXXXXXX",   // UserPoolClientId
  redirectUri: window.location.origin + "/callback",
  region: "eu-west-1",
};
```

Édite `frontend/js/api.mjs` avec l'endpoint API Gateway :

```javascript
const API_BASE = "https://abc123.execute-api.eu-west-1.amazonaws.com/dev";
```

---

### Étape 8 — Re-synchroniser le frontend et invalider le cache

Après avoir mis à jour les fichiers JS du frontend :

```bash
bash scripts/sync-frontend.sh dev
```

Ce script :
1. Sync tous les fichiers vers le bucket S3 frontend
2. Applique les bons headers de cache (1 an pour CSS/assets, 5 min pour HTML/JS)
3. Invalide automatiquement le cache CloudFront (`/*`)

---

### Étape 9 — Vérifier le déploiement

1. Ouvre l'URL `FrontendUrl` dans ton navigateur (ex: `https://d1234abcd.cloudfront.net`)
2. Clique sur **Se connecter** → tu es redirigé vers la page Cognito
3. Crée un compte ou connecte-toi
4. Une fois connecté, tu arrives sur le dashboard
5. Uploade une vidéo → elle apparaît dans la liste après quelques secondes
6. Clique sur une vidéo pour la lire via le lecteur intégré

---

## Mises à jour

Pour redéployer après une modification du code backend ou de l'infrastructure :

```bash
bash scripts/deploy.sh dev
```

Pour redéployer uniquement le frontend :

```bash
bash scripts/sync-frontend.sh dev
```

---

## Supprimer l'infrastructure

Pour éviter des frais inutiles, supprime le stack quand tu n'en as plus besoin :

```bash
sam delete --stack-name secure-video-platform-dev
```

> Attention : le RDS utilise `DeletionPolicy: Snapshot` — un snapshot final sera créé automatiquement avant la suppression. Supprime-le manuellement dans la console AWS si tu n't en as pas besoin.

---

## Coûts estimés

| Service | Coût estimé (faible trafic) |
|---------|----------------------------|
| Lambda | ~0€ (free tier) |
| API Gateway | ~0€ (free tier) |
| S3 | ~0.02€/GB/mois |
| CloudFront | ~0.085€/GB transféré |
| RDS (db.t3.micro) | ~15€/mois |
| NAT Gateway | ~32€/mois |
| Cognito | Gratuit < 50k MAU |

> Le coût principal vient du **NAT Gateway (~32€/mois)** et du **RDS (~15€/mois)**, présents même sans trafic. Pense à supprimer le stack après tes tests.

---

## Variables d'environnement Lambda

| Variable | Description |
|----------|-------------|
| `VIDEO_BUCKET_NAME` | Nom du bucket S3 des vidéos |
| `CLOUDFRONT_DOMAIN` | Domaine CloudFront des vidéos |
| `CLOUDFRONT_KEY_PAIR_ID` | ID de la clé publique CloudFront |
| `DB_SECRET_ARN` | ARN du secret Secrets Manager (credentials DB) |
| `ENVIRONMENT` | Environnement de déploiement (`dev`, `prod`) |

---

## Sécurité

- **Authentification** : OAuth2 via Cognito User Pool avec validation JWT sur chaque requête API
- **Autorisation** : Politiques IAM restrictives (principe du moindre privilège)
- **Réseau** : Lambda et RDS dans une VPC privée, accès internet via NAT Gateway
- **Données** : URLs signées temporaires pour l'upload et la lecture des vidéos
- **Secrets** : Credentials DB et clé privée CloudFront stockés dans AWS Secrets Manager
- **CORS** : Configuration stricte sur API Gateway (origine frontend uniquement en prod)
- **Transport** : HTTPS imposé via CloudFront

---

## Tests

```bash
# Tests unitaires des fonctions Lambda
cd backend/functions/generate-upload-url && npm test
cd backend/functions/list-videos && npm test
cd backend/functions/process-video && npm test
```

---

## Licence

Ce projet est sous licence [MIT](./LICENSE).

---

**Réalisé dans le cadre de la certification AWS Dyma** — Environnement cloud pour le déploiement et la gestion d'applications web sécurisées et scalables.

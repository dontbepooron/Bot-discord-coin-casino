# Casino Bot (NozCoins dédicace à Nozura)

Bot Discord casino en JavaScript (Node.js + discord.js + SQLite) avec système économie, jeux, setup interactif, boutique/tirages, logs et outils d'administration.

## Crédits
Ce bot est **développé par dvm #🇵🇸**.

## Sommaire
- [Aperçu](#aperçu)
- [État Du Projet](#état-du-projet)
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation Rapide](#installation-rapide)
- [Configuration](#configuration)
- [Lancement](#lancement)
- [Commandes](#commandes)
- [Architecture](#architecture)
- [Permissions Discord Recommandées](#permissions-discord-recommandées)
- [Sécurité Et Garde-Fous](#sécurité-et-garde-fous)
- [Dépannage](#dépannage)
- [Roadmap V2](#roadmap-v2)

## Aperçu
Le bot propose une économie de serveur centrée sur `NozCoins` avec:
- commandes économie (`bal`, `profil`, `daily`, `collect`, `don`),
- jeux casino (roulette, blackjack, slots, coinflip, etc.),
- panel setup interactif (profil, tirage, shop, inventaire, succès),
- commandes de modération et d'audit,
- outils owner/buyer (gestion avancée, panel `.panale`, reset, logs).

## État Du Projet
Ce projet est une **V1 développée rapidement**.

Points importants:
- Le bot a été **développé à l'arrache** sur plusieurs parties techniques.
- Certains systèmes prévus ne sont **pas finalisés**.
- Le **système de clans** n'est pas disponible en version complète.
- Le **système de pillages avancés** n'est pas disponible en version complète.
  - Note: une commande de vol existe (`+vol`), mais le module pillage complet prévu initialement n'est pas livré en V1.

Détails supplémentaires dans [PROJECT_STATUS.md](/home/dontbepooron/Casino/PROJECT_STATUS.md).

## Fonctionnalités
- Économie persistante par serveur (SQLite): coins, XP, profils, transactions.
- Jeux avec cooldowns, mises minimales, blocage par panel admin.
- Setup casino interactif (GIF, shop, tirages pondérés, inventaire, succès).
- Système rôles intégré (résolution automatique + sync setup).
- Giveaway intégré avec gestion d'entrées et reroll.
- Logs d'audit: commandes, sécurité, gains, tirages, transactions.
- Permissions hiérarchisées: buyer, owner, groupes, blacklist.

## Prérequis
- Node.js `>= 20.11.0`
- npm
- Linux recommandé (ou environnement compatible)
- `ImageMagick` requis pour le rendu d'image profil (`convert`)

Exemple d'installation ImageMagick (Debian/Ubuntu):

```bash
sudo apt update
sudo apt install -y imagemagick
```

## Installation Rapide
1. Cloner le projet.
2. Installer les dépendances.
3. Configurer `.env` et `config.json`.
4. Lancer le bot.

```bash
npm install
cp .env.example .env
npm start
```

## Configuration

### 1) `.env`
Variables minimales:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=
```

### 2) `config.json`
Clés importantes:
- `prefix`: préfixe principal (`+`),
- `buyerId`: ID Discord buyer,
- `currency.name`, `currency.coinEmoji`, `currency.xpFlaskEmoji`,
- `cooldowns.*`: cooldowns commandes,
- `limits.minGameBet`: mise minimale globale des jeux,
- `limits.maxDonation`, `limits.maxVolCoins`, `limits.maxVolXp`,
- `embedColor.*`: palette embeds.

## Lancement
- Production:

```bash
npm start
```

- Dev (watch):

```bash
npm run dev
```

- Vérification syntaxe:

```bash
npm run check
```

## Commandes
Le listing complet est disponible via `+help` (panel interactif).

Exemples rapides:
- Économie: `+bal`, `+profil`, `+daily`, `+collect`, `+don`.
- Jeux: `+roulette`, `+blackjack`, `+slots`, `+coinflip`, `+hilo`, `+craps`, `+jackpot`, `+bingo`, `+pfc`.
- Setup: `+setup`, `+shopadd`, `+drawadd`, `+setreward`, `+setupseed`.
- Modération: `+warn`, `+sanctions`, `+bl`, `+tempbl`.
- Admin/Owner: `+setcommandpanel`, `+setprofil`, `+autologs`, `+rollbacktx`.
- Buyer: `+panale`, `+give`, `+owner`, `+reset`, `+setmodetest`, `+setmodeprod`.

## Architecture
Structure principale:
- `src/index.js`: bootstrap client + DB + handlers.
- `src/db/database.js`: schéma SQL + data store.
- `src/handlers/`: chargement dynamique commandes/events.
- `src/events/`: événements Discord (ready, messages, interactions).
- `src/commands/`: commandes par domaine.
- `src/utils/`: helpers métier (setup, profils, logs, accès, branding).
- `data/`: base SQLite et données runtime.
- `image/`: assets (fonds, GIF setup, etc.).

## Permissions Discord Recommandées
- `ViewChannel`
- `SendMessages`
- `EmbedLinks`
- `AttachFiles`
- `ReadMessageHistory`
- `AddReactions`
- `ManageRoles` (fortement recommandé pour setup/shop/tirages rôles)
- `ManageChannels` (si auto-création logs)

## Sécurité Et Garde-Fous
- Vérification profil obligatoire sur les commandes concernées.
- Contrôle d'accès buyer/owner/groupes.
- Blacklist permanente/temporaire.
- Cooldowns commandes.
- Logs audit + historique transactions + outils de rollback.
- Blocage ciblé des commandes de jeux via panel.

## Dépannage
- `DISCORD_TOKEN manquant`:
  - Vérifier `.env` et relancer.
- Les cartes profil ne s'affichent pas:
  - Vérifier `ImageMagick` (`convert`) installé.
- Rôles non attribués:
  - Vérifier hiérarchie des rôles + permission `ManageRoles`.
- Setup GIF non envoyé:
  - Vérifier la présence des fichiers dans `image/` et la limite d'upload du serveur.

## Roadmap V2
V2 potentielle (non datée):
- vrai système de clans,
- vrai système pillage complet,
- refonte de certains modules V1,
- meilleur découpage interne et tests plus robustes.

---
Projet maintenu en V1 avec logique pragmatique. Une V2 pourra sortir plus tard selon le temps disponible.

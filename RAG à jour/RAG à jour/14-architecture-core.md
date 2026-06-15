# 14 — Architecture Core

## Vue d'ensemble

Smart.AI repose sur une architecture intégrée qui combine méthode (A.R.C.), technologie (plateforme Smart.AI) et intelligence artificielle (agents orchestrés par Jarvis).

Ce qui différencie Smart.AI d'un outil ou d'une agence de leads, c'est précisément cette architecture : chaque composant alimente les autres et forme un système cohérent.

---

## Jarvis — La Control Tower

Jarvis est le cerveau central du système Smart.AI.

**Ce que Jarvis fait :**

- centralise toutes les données commerciales de l'agence (prospects, interactions, pipeline, KPI)
- orchestre les agents IA spécialisés et coordonne leurs actions
- pilote les workflows d'acquisition de manière autonome
- génère des insights et des recommandations sur la performance commerciale
- s'adapte aux résultats pour optimiser le système en continu

**Métaphore :**

Jarvis est la tour de contrôle. Les agents sont les avions. Sans la tour de contrôle, les avions volent en silo et se croisent sans coordination. Avec Jarvis, ils forment un système cohérent et dirigé.

---

## Les agents IA

### Prospector

**Rôle :** identifier et présélectionner les prospects correspondant à l'ICP.

**Ce qu'il fait :**

- recherche de prospects selon les critères définis (type d'agence, taille, CA, signaux d'achat)
- présélection initiale basée sur les règles de qualification
- alimentation du pipeline avec des leads frais

### Enrichment Agent

**Rôle :** enrichir les données des prospects pour personnaliser les messages.

**Ce qu'il fait :**

- collecte d'informations contextuelles sur l'entreprise et le fondateur
- identification des signaux d'achat (contenus publiés, actualités, recrutements, changements)
- enrichissement du profil pour permettre une personnalisation précise des messages

### Scoring Agent

**Rôle :** noter et prioriser les prospects selon leur pertinence et maturité.

**Ce qu'il fait :**

- attribution d'un score de qualification (0 à 100) basé sur les critères ICP
- priorisation des prospects dans le pipeline
- identification des leads chauds à contacter en priorité
- mise à jour du score selon l'évolution du comportement du prospect

### Outreach Agent

**Rôle :** personnaliser et envoyer les séquences de contact.

**Ce qu'il fait :**

- personnalisation des messages selon le profil et le contexte du prospect
- gestion des séquences multi-touches (LinkedIn, email)
- suivi des réponses et adaptation des relances
- transmission des leads chauds vers le CRM et le fondateur

---

## Le flux entre les composants

```
Jarvis (Control Tower — orchestrateur central)
    │
    ├── Prospector
    │     → identifie les prospects ICP
    │     → alimente le pipeline
    │
    ├── Enrichment Agent
    │     → enrichit les données prospects
    │     → prépare la personnalisation
    │
    ├── Scoring Agent
    │     → note et priorise les leads
    │     → identifie les leads chauds
    │
    ├── Outreach Agent
    │     → personnalise et envoie les séquences
    │     → gère les relances
    │     → remonte les réponses à Jarvis
    │
    └── Dashboards KPI
          → CAC, LTV, conversion, cycle de vente
          → performance des agents
          → insights et recommandations Jarvis
```

---

## La plateforme Smart.AI

La plateforme est l'interface qui donne à l'agence la visibilité sur son système.

Elle permet de :

- visualiser le pipeline en temps réel
- accéder aux agents IA et à leurs résultats
- suivre les KPI (CAC, LTV, taux de conversion, rendez-vous générés)
- lire les insights produits par Jarvis
- ajuster les paramètres du système

---

## Principe fondamental de l'architecture

L'architecture Smart.AI n'est pas une collection d'outils assemblés.

C'est un système intégré où chaque composant alimente les suivants :

Prospector alimente Enrichment.
Enrichment alimente Scoring.
Scoring guide Outreach.
Outreach remonte les données à Jarvis.
Jarvis optimise l'ensemble.

Le résultat est une machine commerciale prévisible, pilotable et qui s'améliore dans le temps.

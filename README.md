# AI Co-Scientist

En frittstående demo inspirert av Google DeepMinds **AI co-scientist** og ideen om
*agentisk KI i vitenskap*: et fler-agent-system som tar et forskningsmål i naturlig
språk og **selv genererer, kritiserer, rangerer og foredler hypoteser** — synlig i
nettleseren mens "turneringen" pågår.

## De seks agentene
1. **Generation** – genererer nye, testbare hypoteser (kan lese litteratur via web-søk).
2. **Reflection** – fagfellevurderer hver hypotese (nyhet, korrekthet, gjennomførbarhet, testbarhet, sikkerhet).
3. **Ranking** – Elo-turnering med parvise "scientific debate"-kamper.
4. **Evolution** – forbedrer de beste hypotesene (refine / combine / simplify / analogous).
5. **Proximity** – klyngedeler like hypoteser og flagger redundans.
6. **Meta-review** – syntese + veiledning som mater neste generasjonsrunde.

En *Supervisor* kjører dette i runder og strømmer alt til nettleseren via SSE.

## To motorer
- **`ENGINE=mock`** (standard): kjører hele loopen **uten API-nøkkel, uten API-kall, uten kostnad**, med varierte, forhåndsgenererte hypoteser. Perfekt for å se hvordan systemet fungerer.
- **`ENGINE=claude`**: den ekte versjonen — bruker `claude-opus-4-8` (og `claude-haiku-4-5` til klyngedeling) via Anthropic-APIet. Krever `ANTHROPIC_API_KEY`.

Bytte av motor er kun en env-variabel; resten av koden er identisk.

## Kjøre lokalt
Krever Node ≥ 20.

```bash
npm install
cp .env.example .env        # mock fungerer som det er — ingen nøkkel nødvendig
npm start                   # → http://localhost:8787
```

Åpne `http://localhost:8787`, skriv et forskningsmål (f.eks. *"Effekten av ulike
pedagogiske metoder på dybdelæring"*), velg antall runder og trykk **Start forskning**.

### Ekte Claude-kjøring
Rediger `.env`:
```
ENGINE=claude
ANTHROPIC_API_KEY=sk-ant-...
# valgfritt, hvis nettverkspolicy tillater web-søk:
ENABLE_WEB_SEARCH=true
```
Så `npm start` igjen.

## Kostnad (kun `ENGINE=claude`)
Mange Opus-kall per runde (generering + reviews + Elo-kamper + evolusjon + meta-review).
Typisk **~1–2 USD per runde**, **~3–8 USD for en full kjøring** på 2–3 runder.
Demping innebygd: prompt caching av den stabile prefiksen (forskningsmål + ramme),
Haiku til klyngedeling, tak på antall kamper, `MAX_ROUNDS` og et `TOKEN_BUDGET`-tak.
`mock`-motoren koster **0**.

## Slik bekrefter du prompt caching
Med `ENGINE=claude` viser fotlinjen i UI-et `cache-lest`-tokens. Det første agent-kallet
i en kjøring *skriver* cachen; alle påfølgende kall innen 5-minutters-vinduet *leser* den
(`cache_read_input_tokens > 0`), fordi alle agentene deler den samme cachede system-prefiksen.

## Arkitektur
```
src/
  server.js      HTTP + SSE; serverer frontend, starter/strømmer kjøringer
  engine.js      velger mock- eller claude-motor (begge har samme complete())
  anthropic.js   ekte Claude-adapter (modell/thinking/effort-regler, caching, web_search)
  mock.js        mock-motor + forhåndsgenerert innhold
  cache.js       cachet system-prefiks
  schemas.js     Zod + JSON-schema for strukturert output
  state.js       RunState (hypoteser, reviews, Elo, klynger, meta-review)
  supervisor.js  orkestrerer de seks agentene i runder
  elo.js         Elo-matematikk
  pool.js        begrenset parallellitet
  agents/        de seks agentene
public/          vanilla-JS frontend (EventSource)
```

## Forbehold
Dette er et idé- og resonneringsverktøy — hypotesene må verifiseres av et menneske.
Kjøringer holdes i minnet og forsvinner ved omstart av serveren.

import type { GameType } from '../types'

export interface GameRuleEntry {
  title: string
  summary: string
  howToPlay: string[]
  scoring: string[]
  tips: string[]
}

export const GAME_RULES: Record<GameType, GameRuleEntry> = {
  skins: {
    title: 'Skins',
    summary: 'Each hole is worth one "skin." Win the hole outright (lowest score) and you win the skin. Ties carry the skin to the next hole.',
    howToPlay: [
      'Each hole has one skin.',
      'The player with the lowest score on the hole wins the skin.',
      'If two or more players tie, the skin carries over to the next hole (if carryovers are on).',
      'Carryover skins accumulate, making later holes worth more.',
      'Optional presses let a player raise the value mid-round.',
    ],
    scoring: [
      'Total points = entry x number of players.',
      'Each skin is worth an equal share of the total.',
      'If carryovers stack, a single hole can be worth multiple skins.',
      'A press multiplies the value from the press hole onward.',
      'Gross mode: raw scores. Net mode: handicap strokes applied.',
    ],
    tips: [
      'Carryovers make the game more exciting — a tied hole 17 means hole 18 could be worth several skins.',
      'Press when you are down to raise the value from that hole on.',
      'Net skins levels the playing field for mixed-handicap groups.',
    ],
  },

  best_ball: {
    title: 'Best Ball (2v2)',
    summary: 'Two teams of two compete. On each hole, the best (lowest) score from each team counts. The team that wins more holes (or has the lower total) wins the round.',
    howToPlay: [
      'Players are split into Team A and Team B (2 per team).',
      'On each hole, both players on a team play their own ball.',
      'The lower score of the two teammates is the team score for that hole.',
      'Match scoring: team with more holes won wins. Total scoring: lowest cumulative team score wins.',
    ],
    scoring: [
      'Match play: count holes won per team; most holes wins the round.',
      'Total play: sum each team\'s best-ball scores across all holes; lowest total wins.',
      'Ties split the total (or refund entries).',
      'Gross or net scoring available.',
    ],
    tips: [
      'Pair a strong and weak player on each team for balanced matches.',
      'In match play, individual bad holes hurt less — your partner can bail you out.',
      'Requires an even number of players (2, 4, 6).',
    ],
  },

  nassau: {
    title: 'Nassau',
    summary: 'Three segments in one: front 9, back 9, and overall 18. Win any segment to collect that portion of the total. The most popular golf format.',
    howToPlay: [
      'The round is split into three segments: front 9, back 9, and total 18.',
      'Each segment is worth 1/3 of the total.',
      'The player with the lowest total strokes in each segment wins that segment.',
      'Optional presses: when losing, a player can "press" to raise the value from that hole to the end of the nine.',
    ],
    scoring: [
      'The total is divided equally across 3 segments.',
      'Each segment winner takes their 1/3 of the total.',
      'Ties in a segment result in that portion being split.',
      'Each press adds a segment\'s worth of value.',
      'Gross or net scoring available.',
    ],
    tips: [
      'Nassau is great because you can lose the front but still win the back and overall.',
      'Pressing when down keeps the game interesting but increases your exposure.',
      'The "2-down automatic press" is a popular house rule.',
    ],
  },

  wolf: {
    title: 'Wolf',
    summary: 'A rotating-captain game where the "wolf" picks a partner (or goes alone) on each hole. Lone wolf doubles the value. Strategic and social.',
    howToPlay: [
      'Players rotate as the "wolf" each hole.',
      'After seeing each player tee off, the wolf either picks a partner or goes lone wolf.',
      'Wolf + partner vs. the other players: lower team score wins.',
      'Lone wolf plays 1 vs. all — if the wolf wins, they collect double from each opponent.',
      'If the wolf loses as lone wolf, they pay double to each opponent.',
    ],
    scoring: [
      'Points (units) are tracked per hole based on wins/losses.',
      'Normal hole: winning team gets 1 unit from each loser.',
      'Lone wolf: the value is doubled (2 units per opponent).',
      'At round end, net units determine how the total is split.',
      'Ties push (no points exchanged).',
    ],
    tips: [
      'Going lone wolf is high risk, high reward — do it when you stripe one down the middle.',
      'Pick your partner strategically based on their tee shot.',
      'Wolf requires at least 3 players (best with 4).',
    ],
  },

  bingo_bango_bongo: {
    title: 'Bingo Bango Bongo',
    summary: 'Three points available per hole: Bingo (first on the green), Bango (closest to the pin once all are on), Bongo (first to hole out). Great equalizer for all skill levels.',
    howToPlay: [
      'Three points are awarded on every hole.',
      'Bingo: First player to get their ball on the green.',
      'Bango: Player closest to the pin after everyone is on the green.',
      'Bongo: First player to hole out (finish the hole).',
      'Points are tallied at the end; highest total wins.',
    ],
    scoring: [
      'Each point is worth an equal share of the total.',
      'Total possible points = 3 x number of holes (54 for 18 holes).',
      'Winners split the total proportionally based on points earned.',
      'If no points are recorded, entries are refunded.',
    ],
    tips: [
      'Order of play matters! Play farthest from the hole first (as per golf etiquette).',
      'High-handicap players can compete — short hitters often get Bingo by being closer to the green.',
      'Great game when skill levels vary widely.',
    ],
  },

  vegas: {
    title: 'Vegas',
    summary: 'A 2v2 team game where each team combines their individual scores into a 2-digit number. The difference between team numbers determines points. Low score goes first — 4 and 5 becomes 45, not 54.',
    howToPlay: [
      'Players are split into Team A and Team B (2 per team).',
      'On each hole, both players on a team play their own ball.',
      'Each team\'s scores are combined into a 2-digit number: lowest score first.',
      'Example: if Team A scores 4 and 5 → 45. If Team B scores 3 and 6 → 36.',
      'The difference between the two numbers is the points for that hole.',
    ],
    scoring: [
      'Lower team number wins the hole.',
      'Points = the absolute difference between team numbers.',
      'Example: Team A has 45, Team B has 36 → Team B wins 9 points (45-36).',
      'Total points are accumulated across all holes.',
      'Team with more total points wins the round.',
    ],
    tips: [
      'Pair consistent players together — two 5s (55) beats a 3 and 8 (38) but loses to a 4 and 4 (44).',
      'A blow-up hole can be devastating since it creates a high second digit.',
      'Requires exactly 4 players (2 per team).',
    ],
  },

  stableford: {
    title: 'Stableford',
    summary: 'Point-based scoring that rewards good holes and minimizes the penalty for bad ones. Popular worldwide, especially in handicap play.',
    howToPlay: [
      'Each hole earns points based on your score relative to par.',
      'Double bogey or worse = 0 pts, Bogey = 1, Par = 2, Birdie = 3, Eagle = 4, Albatross = 5.',
      'Total your points across all holes.',
      'Highest total points wins.',
      'Pick up your ball after double bogey to speed up play (you get 0 pts either way).',
    ],
    scoring: [
      'Points are awarded per hole based on score vs. par.',
      'The total is split proportionally based on total points.',
      'Net mode applies handicap strokes, making it very fair for mixed groups.',
      'Typical 18-hole scores: 20-25 (amateur), 36+ (scratch).',
    ],
    tips: [
      'Stableford rewards aggressive play — going for birdie has upside with limited downside.',
      'A blow-up hole only costs 2 points (par value) rather than ruining your round.',
      'Great for groups with widely different skill levels when using net scoring.',
    ],
  },

  dots: {
    title: 'Dots / Trash',
    summary: 'Award "dots" for achievements during the round — sandies, greenies, one-putts, and more. Each dot is worth a set value. Snakes (3-putts) cost you!',
    howToPlay: [
      'Before the round, choose which dot types are active and the value per dot.',
      'During play, mark dots as they happen on each hole.',
      'Positive dots (sandy, greenie, etc.) earn you points from each opponent.',
      'Snake (3-putt) costs you — you pay each opponent.',
      'Settle up at the end based on net dots.',
    ],
    scoring: [
      'Each positive dot: you earn the dot value from each other player.',
      'Snake: you pay the dot value to each other player.',
      'Net settlement at the end of the round.',
      'More dot types = more action (and more points changing hands).',
    ],
    tips: [
      'Start with just sandies and greenies if the group is new to dots.',
      'Snakes add a fun penalty — think twice before that aggressive lag putt.',
      'Works great as a side game alongside skins or Nassau.',
    ],
  },

  banker: {
    title: 'Banker',
    summary: 'A rotating "banker" takes on all other players each hole. Beat the banker and they pay you; lose and you pay the banker. High risk, high reward on your banking holes.',
    howToPlay: [
      'Players rotate as the "banker" each hole in a set order.',
      'The banker plays against every other player individually.',
      'If a player beats the banker, the banker pays 1 unit.',
      'If the banker beats a player, that player pays 1 unit.',
      'Ties push (no points change hands).',
    ],
    scoring: [
      'Units are tracked per hole. Net units determine how the total is split.',
      'The banker has the most at stake — they could win or lose multiple units per hole.',
      'With 4 players, the banker can win or lose up to 3 units per hole.',
      'Gross or net scoring available.',
    ],
    tips: [
      'As banker, play conservatively — you\'re playing against everyone.',
      'Works best with 3-4 players.',
      'Banking holes on par 3s are less risky (less variance).',
    ],
  },

  quota: {
    title: 'Quota',
    summary: 'Each player gets a target (quota) based on their handicap. Score Stableford points and try to exceed your quota. The player who beats their quota by the most wins.',
    howToPlay: [
      'Before the round, each player\'s quota is set (typically 36 minus handicap).',
      'Scoring uses the Stableford system: Double bogey+=0, Bogey=1, Par=2, Birdie=3, Eagle=4.',
      'Your net score = Stableford points minus your quota.',
      'The player with the highest net score (most over quota) wins.',
    ],
    scoring: [
      'Quota is auto-calculated: 36 minus course handicap.',
      'A scratch golfer needs 36 points (all pars). A 20-handicap needs only 16.',
      'The total is split proportionally among players who exceeded their quota.',
      'If no one exceeds their quota, entries are refunded.',
    ],
    tips: [
      'Quota is the fairest game for mixed-handicap groups.',
      'Everyone competes against their own target, not each other directly.',
      'Pick up after double bogey — no points lost, saves time.',
    ],
  },

  hammer: {
    title: 'Hammer',
    summary: 'A 2-player press game where you "throw the hammer" to double the value. Your opponent must accept (doubling the value) or decline (losing the current value). Pure psychological warfare.',
    howToPlay: [
      'Played between exactly 2 players.',
      'Each hole starts at the base value. One player holds the "hammer."',
      'The hammer holder can throw it at any point during the hole to double the value.',
      'The opponent must either Accept (the value doubles, hammer passes to them) or Decline (they lose the current value).',
      'The hammer alternates to start — Player A on odd holes, Player B on even holes.',
      'When accepted, the receiver now holds the hammer and can throw it back.',
    ],
    scoring: [
      'Base value is set before the round (e.g., 1 pt per hole).',
      'Throwing & accepting doubles the current value: 1 → 2 → 4 → 8 pts...',
      'Declining forfeits the current value to the thrower.',
      'If no hammer is thrown, the hole winner gets the base value.',
      'Running tally tracks net amount owed.',
    ],
    tips: [
      'Throw the hammer when you have a clear advantage — or as a bluff.',
      'Declining early is cheap. Declining after multiple presses is expensive.',
      'The psychological game is as important as the golf.',
      'Set a max number of presses per hole to keep things manageable.',
    ],
  },
}

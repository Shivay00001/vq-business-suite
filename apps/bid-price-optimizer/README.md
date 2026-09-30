# Bid Price Optimizer

Find the bid price that maximizes **expected value** given your estimated cost and
your honest win probability at the low and high ends of your bidding band.

## Formula

EV(price) = (price − cost) × P(win at price)

Win probability is interpolated linearly between the two endpoints you enter
(0–1 scale, e.g. 0.8 = 80%).

## How to use

1. Enter estimated cost, lowest and highest bid prices you'd quote.
2. Enter win probability at each end (must fall or stay flat as price rises).
3. The tool scans 100 points and recommends the highest-EV price, with a
   comparison table.

## Notes

- Lowest price must cover your cost (rejected otherwise).
- The recommendation is only as good as your probability estimates — base them
  on past bid records. Decision aid, not a guarantee.

## Files

- `index.html` — page, SEO head, FAQ, AdSense slots
- `app.js` — pure logic (node-testable) + browser UI
- `README.md` — this file

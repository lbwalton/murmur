# The journey: belts, achievements, and unlocks

murmur tracks your dictation practice the way Brazilian Jiu-Jitsu tracks time on the mat. Nothing here is purchasable and nothing gates features: rank is proof of practice, cosmetics are the reward, and the numbers all live on your machine.

## How do belts work in murmur?

The ladder follows the adult BJJ system: white, blue, purple, brown, black, each with four stripes, then black belt degrees, the coral belts, and the red belt. Promotion needs BOTH of two gates, exactly like the art it borrows from:

- **Words**: lifetime words dictated
- **Days on the mat**: distinct days you actually dictated

A monster weekend cannot skip you up the ladder; only showing up can. The journey tab shows both gates, your dated promotion history, and how your lifetime words compare to famous books (a rotating line: today it might be The Hobbit, tomorrow War and Peace).

## What are the exact requirements for each belt and stripe?

Every promotion requires BOTH numbers: lifetime words dictated AND distinct days on which you dictated at least once. The full ladder, straight from the file the promotion engine reads (`shared/ranks.json`), is also visible in the app on the journey tab under "the full ladder":

| Rank | Words | Days on the mat | Title |
|---|---|---|---|
| white belt | 100 | 1 | the beginning |
| white belt, one stripe | 2,500 | 2 | showing up |
| white belt, two stripes | 6,000 | 4 | finding rhythm |
| white belt, three stripes | 12,000 | 6 | settling in |
| white belt, four stripes | 18,000 | 9 | ready for blue |
| blue belt | 25,000 | 14 | consistency |
| blue belt, one stripe | 35,000 | 20 | daily voice |
| blue belt, two stripes | 45,000 | 26 | second nature |
| blue belt, three stripes | 55,000 | 32 | fluent |
| blue belt, four stripes | 65,000 | 38 | ready for purple |
| purple belt | 75,000 | 45 | your own game |
| purple belt, one stripe | 95,000 | 52 | signature style |
| purple belt, two stripes | 115,000 | 60 | sharp timing |
| purple belt, three stripes | 135,000 | 68 | the mentor |
| purple belt, four stripes | 155,000 | 75 | ready for brown |
| brown belt | 175,000 | 90 | refinement |
| brown belt, one stripe | 210,000 | 100 | polishing |
| brown belt, two stripes | 245,000 | 110 | the details |
| brown belt, three stripes | 280,000 | 120 | almost there |
| brown belt, four stripes | 315,000 | 130 | ready for black |
| black belt | 350,000 | 150 | professor |
| black belt, 1st degree | 500,000 | 210 | professor, 1st degree |
| black belt, 2nd degree | 700,000 | 280 | professor, 2nd degree |
| black belt, 3rd degree | 950,000 | 365 | professor, 3rd degree |
| black belt, 4th degree | 1,300,000 | 500 | professor, 4th degree |
| black belt, 5th degree | 1,750,000 | 650 | professor, 5th degree |
| black belt, 6th degree | 2,300,000 | 800 | professor, 6th degree |
| red and black coral belt, 7th degree | 3,000,000 | 1,000 | master |
| red and white coral belt, 8th degree | 4,000,000 | 1,300 | senior master |
| red belt, 9th degree | 5,500,000 | 1,700 | grandmaster |
| red belt, 10th degree | founder only | founder only | the founder |

## Do levels have a day requirement?

No. Levels count only words: one level per 100,000 lifetime words, starting at level 1. The day gate exists only for belt promotions, so a belt proves showing up while a level just measures volume.

## Why can nobody earn the 10th degree?

In BJJ, the red belt's 10th degree belonged only to the art's founding pioneers. murmur keeps that rule: the 10th degree is the founder's belt, held by exactly one person, the founder of murmur. It renders the way the IBJJF describes it: solid red fabric with no rank bar. The ladder for everyone else tops out at the 9th degree red belt, which is itself a lifetime of dictation.

## What are achievements?

Named badges for moments belts do not measure: your first dictation, streaks (three days to one hundred), single-day word floods, a five-minute marathon take, dictating at strange hours, coming back after a week away. Each unlock arrives as a notification and lives in the journey tab with its earn hint visible to everyone still chasing it.

## What do unlocks actually give me?

Cosmetics only, visible proof of practice: new waveform styles for the pill (pulse arrives with your white belt), accent colors for the waveform (your belt's color always among them once you have a belt; special accents come from specific achievements), and window themes (morning mist arrives at blue belt). Locked items stay visible with exactly how to earn them.

## What is the share card?

A button on the journey tab renders your belt, title, totals, and badge count into a PNG, drawn and saved entirely on your machine. Post it wherever you like: the point of a belt is that people can see it.

## Can I cheat?

Locally, sure: it is your machine and murmur is open source; edit files and you can wear whatever you like on your own wall. The rank system's honesty comes from the same place BJJ's does: a belt only means something in rooms where it was earned. Verified profiles arrive with murmur's future cloud tier.

## What are levels?

Levels run alongside the belts as an infinite ladder: you gain one level for every hundred thousand words you dictate, starting at level 1. Your level shows next to your belt on the journey page and on the share card. Belts are the milestones with dual gates; levels are the odometer that never stops. Levels unlock nothing; like everything in the journey, they are proof of practice.

# Xylophone Basics Explorer

Play-along apps of the *Xylophone Basics* videos from Visual Musical Minds — one lesson for
each video. A student plays along with the mallet, or turns the mallet off (the round button
beside the bars) and plays the bars: tap them, or press C D E F G A B.

**This folder is made by the Xylophone Basics Creation Studio** (⋯ → *Make an app…*), and the
Studio publishes it to GitHub. Don't edit it by hand: `app/`, every lesson page, `index.html`
and `explorer.json` are written again each time. The source is the Studio's `explorer/` folder.

```
index.html              every lesson, as cards
explorer.json           the list of lessons (written from lessons/)
lessons/<id>/           one lesson — its address is the link to embed
  index.html              the app
  lesson.json             the video: slides, running order, timing
  music.m4a               the music (AAC)
  cover.jpg               its title screen
app/                    the player all the lessons share
```

## Putting a lesson in Google Sites

Copy a lesson's link (the **Copy link** button on the front page), then in Google Sites:
**Insert → Embed → By URL**, paste, and make the box wide (16:9 fits best).

- `…/lessons/cde/?ex=3` opens on exercise 3
- `…/lessons/cde/?mallet=off` starts with the student playing

## Taking a lesson off

Delete its folder in `lessons/`, then *Publish to GitHub* from the Studio.

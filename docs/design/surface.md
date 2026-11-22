# The surface

## Purpose

One screen that serves every way the site is used, without mode switches:
planning at home, walking between stations, reading at a station, reading
through afterwards, arriving mid-trail via a sign's QR code. The visitor is
untrained and uses the site for a few hours in their life; whatever they
have built up (where they are, what is around, where they were reading)
survives every interaction. The map is the spatial anchor and never leaves
the screen.

## Situation

- Trail websites fail by having pages: overview, map, station 1..n. Every
  page change discards the walker's orientation, which is why a single PDF
  competes with them.
- Sheet-over-map is Google Maps' pattern. What trail sites lack is its
  coupling to a station sequence, the map's selection state and GPS; trail
  sites are built on CMS pages.
- Phones in portrait, outdoors, in sun, one-handed; desktops and landscape
  at home. Mobile browsers discard tabs after screen-lock, and some
  (Samsung Internet) lay a fixed page out under their bottom toolbar.
  Browsers and devices that fail the map, the location or the audio:
  docs/design/robustness.md.
- The map is MapLibre GL.

## How the site meets it

Two axes on one surface.

Along the trail (horizontal): item 0 is the trail itself (length, walking time,
start, getting there); items 1..n are the stations in order. A tap on a
marker or on prev/next, and the arrow keys, are the same action: the
selection changes, and the map shows it (Camera). On the map the selected
station is highlighted, previous and next in a secondary highlight, the
route segment to the next emphasised. Markers carry the station numbers;
numbers are how people match ground signage to the map. The overview (item
0) is one tap away from every card, not only from the trail's ends: it is
where the whole trail is seen.

Bounds: a trail is local. The map is bounded to the trail's extent with
generous margins and a matching minimum zoom, both derived from the trail's
data, so panning and zooming can't lose the trail. What the bounds hold is
the map's centre, not its whole area: holding the whole view inside them
zooms a tall screen in until they fill its height, which cuts a larger
trail off across a phone in portrait. The margins are wide enough that half
a view past the edge still shows trail. Near their edge, what is brought
into view stands off the middle, and above a card raised past half the
screen a band along their southern edge stays under it; that band is
margin, away from the trail.

Off screen: a finger that brushes the map pans it, which happens to older
visitors most often, and what they were looking at is gone with no evident
way back. Two things deserve a way back: the selection and the visitor.
While either is out of view, a button at the edge of the visible map stands
for it, with an arrow toward it and the thing in small: the selection as
its marker looks, the visitor as their dot. A tap brings the thing into
view: the selection as selecting it does (Camera), the visitor as the
locate button does (Walking help). The visitor's edge button repeats the
locate button on purpose: it is where the eye is when the visitor finds
themselves gone, and it shows which way.

An edge button is shaped like the map's other buttons, not like a mark on
the map, because anything shaped like a mark reads as a place at that
spot: a copy of station 4 beside the visitor's dot above the sheet says "I
am standing next to station 4" when both are under the sheet or far beyond
it, and a visitor who never taps it, or steers by the map alone, keeps
that false picture. For the same reason its arrow is drawn apart from the
visitor's dot, so it doesn't read as the pointer that shows which way they
face, and it carries no distance, since a figure there reads as the
distance to a station.

A thing is out of view when its centre is not on the part of the map that
shows: past the screen's edge or under the sheet. For the overview that
means no station and no stretch of the route in view, and the arrow points
to the trail's nearest part. An edge button appears only once its thing
has been out of view for a moment, so that the sheet passing over a
station or a fix at the edge doesn't make it blink; and not while the site
itself moves the map (a selection being brought into view), since that
move is taking the visitor somewhere. It goes as soon as its thing is
back. Edge buttons keep clear of the map's other buttons and of each
other.

Depth (vertical): the sheet. In portrait it starts at a peek height over
the map and grows as the visitor scrolls up, then its content scrolls;
scrolled down from the peek it shrinks to its lowest position; any position
between is legal. At full extent a strip of map remains. Same map, less of
it.

The card's head stays in view at every sheet height: the handle, a row for
moving along the trail, and the station's number and title with the
language choice. The title comes last, directly above the text it names.

The row has three places, each with one job: the previous station, the
overview, and the next station, with the leg's length and walking time in
the same button. The overview stands between the other two on every
station card, so a visitor finds it where it was on the last card. It
carries the trail's brand name, or else "Übersicht", in the back button's
colours, so that it reads as a button like the others: a glyph alone in a
pale colour looks disabled. A tap on it opens item 0. Where the trail's
name needs the room, the next station's button keeps the number and the
length alone: a time alone could be taken for the time it takes to read
the card, while a length, with the terrain in view on the map, still gives
a feel for the time it takes to walk. A name too wide even then fades out
at the button's edge; where the row has no room for words at all, the
button shows the waymark glyph. Station 1 has no
previous station, so there the overview takes that place as well and is
the way back; the last station has no next one, and "Letzte Station"
stands in its place. On item 0 the row holds the trail's size and "Start
bei 1".

The number before the title looks like the selected marker on the map (on
item 0, the waymark): it ties the card to the marker. The head is also
where the number stays readable when the visitor's dot covers it on the
map (Walking help).

The peek is what a newcomer has in front of them before they have touched
the sheet. From it they should find out that the card holds more than it
shows, and that the card can be read aloud, which they can start at one
tap. The map has the rest of the screen, so whatever height the peek takes
has to show the visitor something. Untrained visitors did not discover
that the minimised sheet scrolls. A line that the screen's edge visibly
cuts through says there is more, without a word.

The peek is the head, the card's first row whole, and a line of what
follows, cut through by the screen's edge. The first row is the same on
every card of a trail: the player (Listening), whole so that its button
reads as a button and takes a tap clear of the browser's own bar below the
screen's edge.

The lowest position is for the visitor who has found out that the sheet
scrolls. They know what the peek is there to tell, and on the walk the map
is what they look at, so they can give it most of the peek's room and have
the card's first row out of the way. The head stays, as at every height:
it names the selected station and moves along the trail, which is what a
visitor walking by the map uses of the card. The sheet stays at its lowest
while they select other stations, by a marker or the head's buttons, and
through a reload (State).

A finger also lowers the sheet by accident: a pan of the map that begins on
the card, a scroll in the wrong direction, a thumb's brush. A visitor to
whom that happens before they have learnt anything would be left with a bar
that looks finished, and untrained visitors did not discover that such a
bar scrolls. So the lowest position says what the peek says, that the card
goes on below: under the head, the top of the card's first row, cut off by
the screen's edge, and the scroll marker. With the handle at the sheet's
top that makes two signs that it moves, at every height.

"Weiterlesen ∨" is a scroll marker: the site's own word at the screen's
edge, for content that goes on below it. What the visitor is to do there is
scroll, and a button would offer pressing it as another way, so the marker
has no button's shape: the word and an arrow down. It stands at the end of
the cut-off line without hiding the line, the cue it names, and takes no
height of its own. It shows whenever the card's content continues below the
screen's edge, at any sheet height and side by side alike: at every height
it is what tells a visitor who doesn't know the sheet that there is more.
It does not wait for the end of the scroll: a short card can still rise to
full extent over blank paper, and full extent stays reachable on every card
so that the sheet travels the same distance from card to card.

Testers tapped the word, expecting a scroll, so a tap scrolls. It turns the
page: the line at the marker comes up to just below the head, so nothing
is skipped, and the scroll stops where the card's end reaches the screen's
edge, so it never scrolls over blank paper. A sheet below full extent rises
no further than that, with the card from its top, so the button the peek
showed stays in view. The tap makes the same scroll a finger would, so it
adds no position or state of its own, and a drag that starts on the word
still scrolls.

The sheet bounces briefly when a different station is selected while it is
minimised (at its peek or lower), and when the head is tapped beside its
controls then: the head is the sheet's grip, and the bounce answers the tap
with "this moves" without moving it. Neither bounces when the card's
content is all on screen.

The sheet starts at peek, so that the visitor discovers it scrolls, which
the card, laid out for the closed sheet, relies on. It starts there for a
visitor arriving (first visit, link, QR code) and in portrait after a turn
of the phone (State).

Transitions the site initiates: exactly one. "Next: 8 Title →" at a card's
end moves along the trail and collapses the sheet to peek; the visitor is
about to walk. The peek is the height the site gives a card, also for a
visitor who had the sheet lower before they raised it to read. Everything
else follows the finger. No page loads; the map never unmounts; selection
changes animate.

Camera: a visitor who has never used the site should find that the map
does what they expected when they select a station. The map moves only
when it must, so the visitor never loses track of where they were; when
it moves, it puts the selection where a newcomer looks for it. The view
that counts is the part of the map the sheet or the card leaves visible: a
station under the sheet is not in view.

A selection already in view moves nothing: a visitor who tapped a marker
sees it change where it is. One out of view is brought near the middle of
the view. A newcomer doesn't yet know what "selected" looks like and looks
for what they opened in the middle; a station at one edge of the view,
with another marked station at the opposite edge, takes seconds to tell
apart. The map zooms out where it must and never zooms in, and the
station may stand a little off the middle where that spares a zoom-out.

How far out the map goes depends on how the station was reached. Opened
on its own (on arrival from a link or a QR code, from the overview's list,
or brought back by its edge button), it is shown at a scale where streets
and buildings read, with its neighbours and the legs to them as far as
they fit; a longer leg runs off the screen, and its line shows the way. At
the whole trail's scale a station's view would look like the overview,
with the other stations bunched in a corner. Stepped to from the station
before or after it (the head's buttons, "Next" at a card's end, Back), the
station stepped from and the leg between come into view as well, however
long the leg: a visitor who selects the next station and then walks there
needs the way from where they stand. The overview brings the whole trail.

The scale is chosen for the map as the sheet leaves it at its peek,
whatever the sheet's height now. Above a raised card the station stands in
the strip at the scale it has with the card lowered, rather than the map
zooming out to squeeze the rest into the strip; lowering the card shows
the rest. With the sheet at its lowest the scale is the same, and
what the map brings into view is placed above where the peek reaches, so
the sheet back at its peek covers none of it.

The map eases from the old view to the new; the zoom-out, pan, zoom-in
flight suits spread-out maps, not a trail inside a town. A tap on the
locate button brings the visitor into view the same way (Walking help).

Listening: where an item has audio (docs/design/trail-content.md), its card
has a player, so a visitor can listen instead of reading and then put the
phone away: a large "Vorlesen" (read aloud) button with the recording's
length, and once it has been started a position slider in the same row, so
nothing else in the card moves. Where a synthetic voice reads, the player
says so. The player is the card's first row and the peek shows it
(Depth): a visitor who starts the recording from the peek has the whole
player there, with the map above it. With the sheet at its lowest a recording plays on, its player all but
hidden, as it is while the visitor reads further down the card. Some
testers (an anecdotal sample) missed a small button in the head, so the
head has none. Audio belongs to the card in view: selecting another card
stops it, so nothing plays that the screen doesn't show
(docs/design/layers.md). While it plays, the lock screen and headphones
carry the media controls (play, pause, seek) with the station's number and
title.

Controls: the basemap choice shows its options side by side with the
selection highlighted, the least surprising control for a visitor who never
learns the site; screen space allows it for now. When the sheet leaves
only a strip of map, the strip is left to the map: the controls give way,
and stay findable by a visitor who never learns the site. They slide out as
the strip shrinks, following the sheet (the basemap choice up off the
screen, the map's buttons down under the card), and come back as it grows:
their form never changes, so there is nothing to learn, and lowering the
sheet, the gesture for more map, is what brings them back. The attribution
stays. The sheet's handle looks draggable and is: dragging it does what
scrolling does. The locate button rides above the sheet's top edge at the
right, where the thumb of the hand holding the phone reaches; side by side,
in the map's lower right corner.

Landscape and desktop: same DOM, map beside sheet, a classic draggable
divider with limits; chosen by aspect ratio, not device. The card's column
starts wide enough for the trail's name on the overview's button, where
that leaves the map its minimum. On a phone turned sideways the head would
hold up to half the screen's height over the text; on a screen that short
the head scrolls away with the card, and the map beside it keeps the
markers to select by.

Walking help (its version: docs/backlog.md): the visitor's position on the
map and which way they face. The route is drawn and the visitor is a dot on
it; keeping a dot on a line takes little map reading. So the map stays north
up and moves only when the visitor asks. A map turned with the visitor
confuses, most when the compass is off, which the site can't tell (only
iOS reports the compass's error). A map that follows the visitor moves by
itself, stops following without the visitor noticing when a finger
brushes it, and shows a visitor away from the route a map with no trail
on it.

- The visitor on the map: a blue dot, the blue every map app uses for
  "you", its accuracy as a pale circle, and while a heading is known a
  pointer on the dot's ring toward where they face. The pointer claims a
  direction and nothing about its error; where the compass measures its
  error (iOS), a cone of that width shows it, and nowhere else, since a
  cone of a width nobody measured claims an accuracy. A fix too old to say
  where the visitor stands (a dead spot, a lift, the page back from the
  background) is stale: the dot goes grey and the leg walked (below) is no
  longer emphasised until the next fix.
- The visitor at a station: the dot is drawn over the station markers,
  since a station is where "you are here" matters most. On the selected
  marker, which is larger than the dot, it sits like a bull's-eye. On an
  unselected one it covers the number: the visitor standing there has the
  sign in front of them, the numbers on either side give the order, and a
  tap on the dot goes through to the marker beneath and opens its card,
  whose head shows the number. The dot lies over the markers at any
  distance, since a look that changed as the dot came near a marker would
  flicker at the point where it changed. Its white ring, not its colour,
  sets it apart from a marker, since a trail's accent may be close to the
  visitor's blue.
- The locate button: location is asked for only from a tap on it, so the
  browser's prompt answers the visitor's own request; a prompt that comes
  unasked tends to be refused by reflex. The button has one look, the
  usual "show me" symbol, since no established symbol means on or off. A
  tap shows the visitor: out of view, they are brought near the middle as a
  selection is (Camera), with the nearest point of the trail however far
  it is, so a visitor off the trail sees which way it lies; and the dot
  pulses, so the eye finds it whether the map moved or not. Above a raised
  card the trail can lie under the card; lowering the card shows it.
  Without a fresh fix the tap waits for one (a stale one is shown
  meanwhile), unless the visitor moves the map or changes the card in the
  meantime. A visitor outside the bounds (at home, or at a railway station
  a few kilometres off) can't be brought into view: the map shows the whole
  trail, their edge button (Off screen) points toward them, and one line
  says how far from the trail they are.
- Heading: the compass where the device has one and allows it; else the GPS
  course while walking (between fixes at walking pace, so a jumping fix
  gives no direction). A compass without an estimate of its own error (iOS
  reports that, uncalibrated or under interference) gives way to the course
  while walking. The compass on iOS needs a permission asked from a tap:
  the locate button's tap asks it first, so it still counts as the tap's.
  Location and the compass need a secure page (https); a phone on a local
  preview gets one from the https dev server (docs/design/trail-content.md,
  Building and checking).
- Permission: the browser asks on the first tap only. Location lasts for
  the tab: once on, it is back after a reload or the tab's return after
  screen-lock without a tap, where the browser has allowed it, and the map
  stays as the visitor left it (State); a new tab or a later visit starts
  without it. There is no off: a visitor who wants none closes the tab.
  Refused, or without https, the map says so in one line, with how to
  allow it.
- The leg walked: while the visitor is on the leg into the selected
  station and not yet at that station, the map emphasises that leg instead
  of the one leading on. A visitor who opened the next card and walks
  there sees the path they are on.

State: the selected station in the URL (`#7`), so reload, share and QR
deep-links land on a station with the sheet at peek. Navigating the browser
(a reload, the tab discarded after screen-lock and restored) should not
inconvenience the visitor, so the sheet's position, the card's scroll, the
view and location survive it in the tab. A sheet at its peek or at its
lowest comes back as that, whatever the window's height by then: a browser's
bars come and go, and a position measured on the screen would miss either by
a few lines. A turn of the phone between portrait and side by side, live or
while the tab was away, is not browser navigation: the new layout starts its
sheet as it starts it (Depth; side by side, the card from its top), and
keeps the station and what was in the middle of the visible map, now in the
middle of the part the new layout leaves visible; the selection then shows
as after a selection (Camera). Each station change is a history entry, so
Back steps back through the cards; leaving the site on Back would surprise.

Language: with more than one, a compact choice in the title row, the
current code and a ∨ ("DE ∨", as government sites show it); a tap opens
the device's own picker with the languages by their own names. It is a
setting of the whole site and sits on every card's head, where the
visitor's eye is. The site opens in the visitor's browser language where
the trail has it. Details and the machine-translation note:
docs/design/trail-content.md, Languages.

Basemap: the trail's first is the default (docs/design/trail-content.md,
trail.json). A national map such as swisstopo's Landeskarte says "this is
our country, not Google", which a local audience appreciates. The site
never switches the visitor's basemap by itself.

Attribution: the map's line stays visible over whatever map remains.

## Not known

Nothing on this screen has been tried on the ground or on iOS, and much of
it has only been seen in headless browsers (docs/backlog.md, State). What
is not known falls into three kinds.

Questions that looking at a phone won't settle:

- Whether a trail is signposted on the ground, which decides how much
  navigation the site carries between stations.
- Whether audio should carry on, or continue with the next station's
  recording, when the visitor walks on. It stops with the card.
- Whether a station link (a QR code at its placard) should land at full
  extent: the visitor standing there wants the text. For the overview, the
  map may be the point.
- Whether the language choice belongs with the map's controls once those
  are redesigned, which would give the title the head's full width.
- Whether the bounds are still needed now that the selection and the
  visitor have their edge buttons.
- The divider's limits side by side per aspect ratio, almost certainly
  different for the map's side and the card's.

To see on a real phone, in the hand and in sunlight:

- The sheet under a finger: whether it wants snap points or free
  positions. A flick down on a raised sheet can run past the peek to the
  lowest position, and a slow drag can leave the screen's edge anywhere in
  the "Vorlesen" button.
- Whether the small things can be read and hit: the leg's line in "Next",
  the scroll marker at the screen's bottom edge, the slider beside the
  "Vorlesen" button on a small phone, the locate button above a raised
  sheet.
- The scroll marker between the lowest position and the peek, where it lies
  over the right half of a started recording's slider.
- The visitor's dot: whether the pointer for their facing is steady with
  the phone held flat, raised and in landscape (on Android the site turns
  orientation into a heading; iOS gives one), whether the pulse after a tap
  on the locate button is seen, and how the dot reads on an unselected
  marker, where its white ring merges with the marker.
- Audio with the screen locked, which the browsers' media session should
  carry and which has not been tried on Android or iOS.
- iOS as a whole: the compass permission, and the sheet's lowest position
  above the home indicator's inset.

To see with visitors who have never used the site, on a trail:

- Whether they find out that the sheet scrolls: whether the cut-off line,
  "Weiterlesen" and the head's bounce are noticed and are enough; whether
  they tap the word, and whether one who only taps gets back down to the
  map. If that fails, the fallback is a visible button that opens and
  closes the sheet.
- Whether they start the narration from the peek, and whether one who
  lowered the sheet while a recording plays finds where to pause it.
- Whether one who lowered the sheet by accident reads the strip under the
  head as a card that goes on, and whether one who keeps it lowered minds
  that "Next" at a card's end brings it back to its peek.
- Whether the overview's button, carrying the trail's brand name, reads as
  the way to the whole trail or as a heading.
- Whether the short form of the next station's button, the number with its
  chevron over the length, reads as the way on.
- Whether the edge buttons are noticed and tapped after an accidental pan,
  and whether the selection's, which shows in the strip above a raised
  sheet whenever the station is under the card, helps a reader or distracts
  one.
- Whether the camera does what they expect: a station in view but at the
  view's edge stays where it is; a station opened on its own shows only
  its surroundings; a step along a long leg goes far out; a visitor far
  from the trail, shown above a raised card, has to lower the card to see
  the trail.
- Whether they miss the number of an unselected station that their dot
  covers, and whether those who scan a code at each station, a new tab
  each time, mind tapping the locate button again.
- Walking: whether the GPS course gives a usable facing in an old town's
  lanes, and whether a fix goes stale at the right age.

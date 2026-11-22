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
  (Samsung Internet) lay a fixed page out under their bottom toolbar: the
  surface takes the window's inner height, the one height the sheet's
  bounds and the visible map are measured from. Browsers and devices that
  fail the map, the location or the audio: docs/design/robustness.md.
- The map is MapLibre GL.

## How the site meets it

Two axes on one surface.

Along the trail (horizontal): item 0 is the trail itself (length, walking time,
start, getting there); items 1..n are the stations in order. Tapping a
marker, prev/next, or swiping the sheet are the same action: the selection
changes, and the map shows it (Camera). On the map the selected station is
highlighted, previous and next in a secondary highlight, the route segment
to the next emphasised. Markers carry the station numbers; numbers are how
people match ground signage to the map. The overview (item 0) is one tap
away from every card, not only from the trail's ends: it is where the whole
trail is seen.

Bounds: a trail is local. The map is bounded to the trail's extent with
generous margins and a matching minimum zoom, both derived from the trail's
data, so panning and zooming can't lose the trail. What the bounds hold is
the centre of the visible map, not its whole area, so that anything inside
them, the visitor near their edge too, can be brought into view; the
margins are wide enough that half a view past the edge still shows trail.

Off screen: a finger that brushes the map pans it, which happens to older
visitors most often, and what they were looking at is gone with no evident
way back. Two things deserve a way back: the selection and the visitor.
While either is out of view, a small button at the edge of the visible map
stands for it: a white pill like the map's other buttons, docked against
the map's frame (the screen's side, the sheet's top edge), holding an arrow
toward the thing and the thing in small. For the selection that is a disc
in the selected marker's colour with the station's number (on the
overview, the waymark); for the visitor, their dot, grey when the fix is
stale. It looks like a button and not like a marker because anything
shaped like a mark on the map reads as a place at that spot: a copy of
station 4 beside the visitor's dot above the sheet says "I am standing
next to station 4" when both are under the sheet or far beyond it, and a
visitor who never taps it, or steers by the map alone, keeps that false
picture. The arrow is drawn in ink and apart from the dot, so it doesn't
read as the pointer that shows which way the visitor faces. A tap brings
the thing into view: the selection as selecting it does (Camera), the
visitor as the locate button does (Walking help). The visitor's edge
button repeats the locate button on purpose: it is where the eye is when
the visitor finds themselves gone, and it shows which way. Edge buttons
carry no distance, since a figure there reads as the distance to a
station.

A thing is out of view when its centre is not on the part of the map that
shows: past the screen's edge or under the sheet. For the overview that
means no station and no stretch of the route in view, and the arrow points
to the trail's nearest part. An edge button appears only once its thing
has been out of view for a moment, and fades in, so that the sheet passing
over a station or a fix at the edge doesn't make it blink; and not while
the site itself moves the map (a selection being brought into view), since
that move is taking the visitor somewhere. It goes as soon as its thing is
back. Edge buttons lie over the markers, keep clear of the locate button
and the attribution, and keep apart: after a pan on the walk the visitor's
moves aside along the edge, so the two stand side by side.

Depth (vertical): the sheet. In portrait it rests at a peek height over the
map and grows as the visitor scrolls, then its content scrolls; any
position between is legal. Implementation sketch, not a rule: the map fixed
behind a scroll container whose top is a transparent spacer that passes
touches to the map; the card begins below it. At full extent a strip of
map (about 15 %) remains. Same map, less of it.

The card's head stays in view at every sheet height. From the top: the
handle; a row for moving along the trail; the station's number and title,
with the language choice beside them. The title sits directly above the
text it names, and the buttons above the title.

The row has three places, each with one job: the previous station ("‹ 3"),
the overview, and the next station ("Next 8", with the leg's length and
walking time, "350 m · 6 min", underneath in the same button). The
overview stands between the other two on every station card, so a visitor
finds it where it was on the last card. It carries the trail's mark, or
else the trail's name (its short title), in ink on a button shaped like
the others: a glyph alone in a pale colour looks disabled. A tap on it
opens item 0, whose title is the name the button showed. Where the row has
no room for a name (a side-by-side column narrower than about 360 px), the
button shows the waymark glyph instead. Station 1 has no previous station,
so there the overview takes that place as well and is the way back; the
last station has no next one, and "Letzte Station" stands in its place.
On item 0 the row holds the trail's size, "10 Stationen" above "ca.
3,5 km", and "Start bei 1".

The number before the title looks like the selected marker on the map (on
item 0, the waymark): it ties the card to the marker. It sits inline, so a
title's second line runs the full width beneath it. The head is also where
the number stays readable when the visitor's dot covers it on the map
(Walking help).

The peek is what a newcomer has in front of them before they have touched
the sheet. From it they should find out that the card holds more than it
shows, and that the card can be read aloud, which they can start at one
tap. The map has the rest of the screen, so whatever height the peek takes
has to show the visitor something. Untrained visitors did not discover
that the minimised sheet scrolls. A line that the screen's edge visibly
cuts through says there is more, without a word.

The peek is the head, the card's first row, whole, and the line after it,
which the screen's bottom edge cuts through the middle of its letters. The
first row is the same on every card of a trail. By default it is the
player (Listening): the "Vorlesen" button, whole, so that it reads as a
button and takes a tap clear of the browser's own bar below the screen's
edge, and beside it the recording's length. The player has no frame of
its own, so the row is no taller than the button. The cut-off line is
whatever the card goes on with: the note that a synthetic voice is reading,
else the card's next block.
A trail whose signs carry its branding can open its station cards with
the sign row instead (`opensWith`, docs/design/trail-content.md); the
peek then shows that row whole, and the cut-off line is the upper half of
the "Vorlesen" button. A card with neither a player nor a sign row has
its own first line cut off, and its peek is the head and that half line.

With the player the peek takes about a fifth of a tall phone's screen
and a quarter of a small one's; a title on two lines adds a line.

"Weiterlesen ∨" is a scroll marker: the site's own word at the screen's
edge, for content that goes on below it. What the visitor is to do there
is scroll, and a button would offer pressing it as another way, so the
marker has no button's shape: it is the word and an arrow down, in the
accent colour. It stands at the right end of the cut-off line, on a soft
patch of the card's paper as wide as the word. The patch covers the
line's end and the rest of the line shows to its left, so the marker
does not hide the cue it names, and it takes no height of its own. It
shows whenever the card's content continues below the screen's edge, at
any sheet height and side by side alike. It does not wait for the end of
the scroll: a short card can still rise to full extent over blank paper,
and full extent stays reachable on every card so that the sheet travels
the same distance from card to card.

Testers tapped the word, expecting a scroll, so a tap scrolls. It turns
the page: the line at the marker's height comes up to just below the
head, so nothing is skipped, and the scroll stops where the card's end
reaches the screen's edge, so it never scrolls over blank paper. A lowered
sheet rises no further than full extent, with the card from its top, so
the button the peek showed stays in view. The tap makes the same scroll a
finger would, so it adds no position or state of its own, and a drag that
starts on the word still scrolls.

The sheet bounces briefly when a different station is selected while it is
minimised, and when the head is tapped beside its controls: the head is
the sheet's grip, and the bounce answers the tap with "this moves" without
moving it. Neither bounces when the card's content is all on screen.

The sheet starts at peek, so
that the visitor discovers it scrolls, which the card, laid out for the
closed sheet, relies on. It starts there for a visitor
arriving (first visit, link, QR code) and in portrait after a turn of the
phone (State).

Transitions the site initiates: exactly one. "Next: 8 Title →" at a card's
end moves along the trail and collapses the sheet to peek; the visitor is
about to walk. Everything else follows the finger. No page loads; the map
never unmounts; selection changes animate.

Camera: a visitor who has never used the site should find that the map
does what they expected when they select a station. The map moves only
when it must, so the visitor never loses track of where they were; when
it moves, it puts the selection where a newcomer looks for it. The view
that counts is the part of the map the sheet or the card leaves visible,
for the in-view test and for the bounds alike; a station under the sheet
is not in view, and the trail's edges must be reachable in whatever strip
of map remains.

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
the rest.

The map eases from the old view to the new; the zoom-out, pan, zoom-in
flight suits spread-out maps, not a trail inside a town. A tap on the
locate button brings the visitor into view the same way (Walking help).

Listening: where an item has audio (docs/design/trail-content.md), its
card has a player, so a visitor can listen instead of reading and then put
the phone away: a large "Vorlesen" (read aloud) button and beside it the
recording's length. Once the recording has been started there is
something to seek, and a position slider shows under the length, in the
same row, so nothing else in the card moves. Where a synthetic voice
reads, a line under the row says so. Unless the trail opens its cards
with the sign row, the player's row is the card's first and the peek
shows it (Depth): a visitor who starts the recording from the peek has
the whole player there, with the map above it. Some testers (an anecdotal
sample) missed a small button in the head, so the head has none. One audio
element belongs to the page, not the card, because cards are re-rendered at
every selection. Audio belongs to the card in view: selecting another card
stops it, so nothing plays that the screen doesn't show. While it plays,
the lock screen and headphones carry the media controls (play, pause, seek)
with the station's number and title.

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
divider with limits; chosen by aspect ratio, not device. A phone turned
sideways has some 360–430 px of height, less the browser's bars, and the
head (about 100–125 px in a 300 px column, more with a larger system font)
would hold up to half of it over the text; on a screen that short the head
scrolls away with the card, and the map beside it keeps the markers to
select by.

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
  cone of a width nobody measured claims an accuracy. A fix older than 30 s
  (a dead spot, a lift, the page back from the background) is stale: the
  dot goes grey and the leg walked (below) is no longer emphasised until
  the next fix, since a walker has gone some 40 m by then.
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
  Without a
  fresh fix the tap waits for one (a stale one is shown meanwhile), unless
  the visitor moves the map or changes the card in the meantime. A
  visitor outside the bounds (at home, or at a railway station a few
  kilometres off) can't be brought into view: the map shows the whole
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
  station (within 40 m of it, with a fix better than 50 m) and not yet at
  that station (at it means within 25 m, until 40 m away), the map
  emphasises that leg instead of the one leading on. A visitor who opened
  the next card and walks there sees the path they are on.

State: the selected station in the URL (`#7`), so reload, share and QR
deep-links land on a station with the sheet at peek. Navigating the
browser (a reload, the tab discarded after screen-lock and restored) should
not inconvenience the visitor, so the sheet's position, the card's scroll,
the view and location survive it in the tab. A turn of the phone between
portrait and side by side, live or while the tab was away, is not browser
navigation: the new layout starts its sheet as it starts it (Depth; side by
side, the card from its top), and keeps the station and what was in the
middle of the visible map, now in the middle of the part the new layout
leaves visible; the selection then shows as after a selection (Camera).
Each station change
is a history entry, so Back steps back through the cards; leaving the site
on Back would surprise.

Language: with more than one, a compact choice in the title row, the
current code and a ∨ ("DE ∨", as government sites show it); a tap opens
the device's own picker with the languages by their own names. It is a
setting of the whole site and sits on every card's head, where the
visitor's eye is. The site opens in the visitor's browser
language where the trail has it. Details and the machine-translation note:
docs/design/trail-content.md, Languages.

Basemap: the trail's first is the default (docs/design/trail-content.md,
trail.json). A national map such as swisstopo's Landeskarte says "this is
our country, not Google", which a local audience appreciates. The site
never switches the visitor's basemap by itself.

Attribution: the map's line stays visible over whatever map remains.

## Not known

- Whether a trail is signposted on the ground, which decides how much
  navigation the site carries between stations.
- Snap points versus free positions for the sheet; to be decided on real
  phones.
- The landscape divider's limits per aspect ratio, almost certainly
  different for the map's side and the card's.
- Whether audio should carry on, or continue with the next station's, when
  the visitor walks on; today it stops with the card. Background playback
  with the screen locked is expected from the browsers' media session but
  untested on iOS and Android.
- Walking help on real phones: the compass direction held flat, raised, and
  in landscape (on Android the site turns orientation into a heading; iOS
  gives one), whether the pointer is steady at walking pace, and the GPS
  course in an old town's lanes.
- Whether visitors miss the number of an unselected station their dot
  covers.
- Whether visitors who scan a code at each station, a new tab each time,
  mind tapping the locate button again.
- Whether the leg's line in "Next" (0.8 rem) reads in sunlight.
- Whether the language choice belongs with the map's controls once those
  are redesigned, which would give the title the head's full width.
- Whether the overview's button, wearing the trail's name, reads as a
  button and as the way to the whole trail, or as a heading.
- Whether visitors start the narration from the peek. Whether the cut-off
  line reads as cut off in sunlight where it is the small grey note of the
  synthetic voice, and where it is the top of a photo.
- Whether the slider beside the button is wide enough to seek with on a
  small phone, most of all in a language with a long word for "read
  aloud".
- Whether "Weiterlesen" and the head's bounce are noticed, in sunlight at
  the screen's bottom edge, and are enough. Whether visitors tap the word,
  and whether its touch target is large enough at the screen's bottom
  edge. Whether a visitor who tapped it then scrolls by finger, or keeps
  tapping; and how one who only taps gets back down to the map (today:
  dragging the head down). If that fails, the fallback is a visible button
  that opens and closes the sheet.
- Whether phones 320 px wide still matter: there a long word for "read
  aloud" (French) brings the button's lower right corner under the edge of
  the marker's patch.
- Whether the edge buttons are noticed and tapped, in sunlight and by the
  visitors who pan by accident; and whether the selection's, which shows
  in the strip above a raised sheet whenever the station is under the
  card, helps a reader or distracts one.
- Whether the bounds are still needed now that the selection and the
  visitor have their edge buttons.
- Whether the camera meets newcomers' expectations (Camera): whether a
  station in view but at the view's edge should still come to the middle;
  whether a station opened on its own shows enough around it, or a step
  along a long leg goes too far out; and whether a visitor far from the
  trail, shown above a raised card without the trail, lowers the card to
  find it.
- Whether a station link (a QR code at its placard) should land at full
  extent: the visitor standing there wants the text. For the overview, the
  map may be the point.

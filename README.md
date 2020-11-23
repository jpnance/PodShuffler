# PodShuffler
Manage your podcasts and push them to a second-generation iPod Shuffle

## What?

PodShuffler is a command-line tool implemented in Node.js that does two things:

1. Manages any number of podcast subscriptions in an iPod-Shuffle-inspired way
2. Indeed, does everything necessary to push them to a second-generation iPod Shuffle

## Why?

I've always loved the simplicity of the iPod Shuffle and was just kind of struck one day to see if I could get some value out of my 2G version that I hadn't used in years. I also wanted more control over how my podcasts got managed (although I'll admit that [Podcast Addict](https://www.podcastaddict.com/) is so configurable that it gets really, really close to what I want).

Using iTunes (or whatever it's called nowadays) was a non-starter to me, so I had to scour what resources existed out there to figure out how to get the device to actually do what I wanted. [wikiPodLinux](http://www.ipodlinux.org/) was an excellent resource (specifically their [iTunesDB page](http://www.ipodlinux.org/ITunesDB/#iTunesSD_file)), along with several existing scripts that had already been implemented by others for general iPod Shuffle management.

I don't use PodShuffler anymore but I wanted to make it visible in case anybody else out there was interested in this type of thing. It's also an example of how to use JavaScript to read and write binary files, which is a neat trick all its own.

## ..What?

The approach PodShuffler takes to podcast management a la iPod Shuffle is that every podcast you subscribe to will, at any given time, have either zero or one (but never more) episodes queued up. There are two main concepts in this style of doing things: which episodes get downloaded and in which order episodes get queued up.

To address the first issue--which episodes get downloaded--PodShuffler lets you pick a strategy. When it comes time to download a new episode, maybe for a certain podcast, you always want the "newest unlistened episode"; maybe for another that you want to listen to in order, you want the "oldest unlistened episode"; maybe for another, you don't care and just want a "random episode". All of those strategies are built in to PodShuffler.

To address the second issue--in which order podcasts get queued up--you're allowed to arbitrarily define playlist priorities but podcasts within the same priority will be queued up in a random order.

## How?

PodShuffler is really designed for Linux/UNIX use because it uses things like `.local` and man pages and even has a defined bash-completion file. It'll probably work anywhere Node.js runs, though.

Whether you clone the repository or not, you should be able to install PodShuffler using `sudo npm install -g jpnance/PodShuffler`. After that, there's a little tutorial in the general PodShuffler man page, accessed by `man podshuffler`.

## Who?

I'm Patrick. I'm the commissioner of the [greatest fantasy football league in the world](https://thedynastyleague.com/) and I also helped make a video game called [Deleveled](https://deleveledgame.com/).

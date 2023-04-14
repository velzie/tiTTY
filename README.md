# tiTTY - the better remote terminal

## why did i create this?
You would think that with an idea as simple as this, there would already be plenty of implementations. and while there are, each have their own unique problems,
be that a buggy and incomplete terminal emulator implementation, convoluted methods of authentication, or just being slow in general.

thus, i'll do it myself, with hterm and catppuccin

## features
this is a very minimal implementation, built to fit my needs and not much more.
- the full power of [hterm.js](https://hterm.org/), a fully complete emulator unlike some other inferior ones that i won't mention ([cough cough](http://xtermjs.org/))
- choice between webrtc and socket.io backends
### admittedly missing features
- authentication (see below)
- file transfer

## configuration
the following environment variables can be set in .env or as normal

- port= - the port the server will listen on
- tty_shell= - the program that the tty will launch. this should usually be set to /bin/bash
yes, these are the only options. if you want more fork it

## authentication
there is no authentication. i didn't want to reinvent the wheel, so this project will assume that there's another method of authentication behind the server itself,
be that a reverse proxy, a vpn/proxy/relay, or simply not forwarding the port this runs on.

if you don't have any of the above and the server is publicly accessible, make sure you're ok with anyone on the internet having access to the shell.
if you're lazy and don't feel like setting up anything, you can run the server as root and set tty_shell to /bin/login, so at least it's password protected.


### credits
- hterm.js
- favicon is the [whiskers](https://github.com/samholmes/whiskers) icon because i didn't feel like making my own


Search in video
Pi CEO Agents
0:00
engineers, there are three massive innovations available to you that unlock
0:05
high lever multi- aent teams like this. This customized PI agent harness is
0:12
running seven clawed 1 million context window agents, but these aren't your
0:18
normal low-level worker agents. This is my CEO and board multi- aent team. This
0:25
is a glimpse into the future where your agents are not only helping you ship the low-level work, they're helping you make
0:32
high-level game time strategic decisions. The first of three
0:37
innovations here is of course the new clawed 1 million context models. Now,
0:43
these models existed before, but somehow Enthropic was able to cut the pricing
0:48
down. And that's the real headliner here. It's one price for the full context window. No long context premium.
0:56
No model lab has been able to do this while maintaining a model that's actually useful. Gemini 3 series have
1:04
claimed the 1 million token context window. Remember when we had Zuck with Llama 4 claiming the 10 million Maverick
1:10
model? It's complete garbage. Anthropic and the Claw team have actually pulled it off. You can see right around that
1:16
250k mark is where things start degrading. about how fast things to grade really matters. For a lot of
1:23
tasks, you don't need perfect retrieval. You need retrieval that doesn't lose the key ideas, the key context, the key
1:30
information that you're using to solve the problem at hand. And it's become quite clear the Opus 4.6 and Sonic 4.6
1:36
model can do that. It can get you there. This enables the next frontier of agentic engineering, and it's really not
1:44
getting talked about enough. This means that the core 4 just got a massive buff.
1:49
Right now, everyone is still using agents as worker bees. Coding, planning, taking actions. You know the drill,
1:56
right? You've seen it. You're probably running one right now. When you combine the 1 million context window with these
2:02
additional two key emerging agentic tools, you unlock incredible capability
2:07
that sits at the center of knowledge work decisionm at this next tier of
2:12
agentic engineering. It's not just you making key [music] decisions anymore. And it's not just your team either. It's
2:18
you, your team, and a country of geniuses in a data center.
2:28
Here's a question to hold in your mind as we work through the CEO and board. How much is a high leverage decision
2:35
really worth to you? Really think about that. How much are you willing to spend? How long are you willing to wait to get
2:40
the best intelligence to answer your hardest questions? Think about that as we break down how this works. First
2:47
things first, as normal on the channel, let's break down the architecture of the system. What we have at a fundamental
2:53
level is we have uncertainty in and we have decisions out. That is the purpose of the CEO and board multi- aent system.
3:00
We take specific inputs and then we deliver specific results. This is a big piece of agentic engineering. You must
3:06
know what's your inputs and what's your outputs. And then at a higher level, what's the real thing, right? What's the
3:12
valuable thing that you're trying to attain here? Now, the workflow is where all the magic happens. We have the
3:17
brief, our input prompt or a question, and then out comes the memo. This is the
3:22
Jeff Bezos response, the recommendation that your CEO and board is going to
3:28
create for you. What happens during the workflow step? This is the full kind of breakdown. You sit at the top, you have
3:33
a customized agent harness and then we have a multi- aent orchestration pattern. Whenever you see a single node
3:39
going out to multiple agents, immediately think multi- aent orchestration. That's exactly what's happening here. We have the powerful 1
3:45
million context opus 4.6 model acting as our CEO here. And that's exactly what's
3:51
happening right here. Our CEO is controlling the conversation. You can see they're wrapping up the meeting here. As most meetings go, you know,
3:57
it's over time. Thankfully, it's not over budget, though. All of our agents are equipped with the 1 million token
4:03
context window. We can do a lot with this as we move forward here. Our CEO is conducting a valuable conversation with
4:10
multiple agents. This is a multi- aent orchestration application and it's built into a customized PI agent harness.
4:18
We're building a unique experience here. This is where specialization is going to take the cake. The PI agent harness lets
4:24
us do that. As Pi likes to say, there are many coding agents, but this one is
4:30
mine. We have that prompt in also known as our brief and then we get memo out. Fantastic. But how does it work? This
4:35
here is our actual workflow. You got to know your inputs. You got to know your outputs. And then you have to design
4:41
your workflow. So the CEO is going to frame the decision. The board is going to debate. So we're going to have multiple agents battling back and forth,
4:48
making key points, arguing pros and cons of a certain question that you have. Importantly here, we're going to check
4:54
our constraints. We're building with agents and we're wrapping them in code in our own customized agent harness.
4:59
That means they stop when we say stop or at least, you know, roughly as we saw here a little bit over time. The CEO
5:06
agent is just wrapping up here. We'll come back to how this works in a moment. But you can see here our CEO controls
5:11
the entire workflow. They decide when enough is enough. And then the CEO creates a final memo, a final decision.
5:19
Think about a high leverage, high impact leader coming into the room, the chief executive officer. They get all the
5:26
information, they debate with the board, and then they create their final memo. Perfect timing. Our memo was created. It
5:32
automatically opened up VS Code. And now, uh, something really cool is going to happen here. We're going to actually get a natural language summary of all of
5:40
our work. So, let's go ahead and just wait for this to fire off here. We're using, of course, a skill that connects
5:45
to 11 Labs. board decided unanimously on YouTube shorts as the primary platform
5:50
but reframed the question 62%.1% churn rate and referral redesign blog
5:55
gets migrated decision gates at day 30 45 and 60 keep us honest
6:01
nice so we got a natural language summary there you know that's just icing on the cake we added a skill to our CEO
6:06
agent so of course we can customize the CEO as much as we want final response comes here from our CEO agent again
6:12
we'll break this out in just a moment that entire process that you just saw produced a final memo. So this is the
6:18
action, right? This is the answer. So question in, answer out. And that brings us to the actual configuration. So this
6:25
is a great branching endpoint to really dive into things. We have a couple key sections here in our configuration file
6:30
that controls the entire process. Constraints. This is really, really important. You don't want this stuff to run forever. And you want to set budgets
6:36
for this, right? Because with 1 million context running rampid, you can do a lot, but it has to be guided properly.
6:43
We then have our paths, all the key files. We'll break these out in a moment. The key ones here, as you can see, is the briefs and the memos. And
6:49
then finally, you can customize whatever agent you want to come to the board. It's your board. So, you can say what
6:55
opinions you want to bring to the table. And the key part here is every one of these agents has their own customized
7:01
system prompt. You can also add additional tools and capabilities via skills to every individual agent,
7:07
further pushing their own unique capabilities. And there's one additional kind of high leverage piece to this, one
7:13
of the three key innovations that we'll talk about later. So this is the configuration. This is how that system works. And it's all about removing
7:21
uncertainty. When you have a big question, a career, company, even personal lifestyle decision, what you
7:28
really have is you have a question and you want a decision out. As a gentic engineers, we need to push what we can
7:34
do with our agents, with our compute. This is a really really high leverage way I've been using agents over the past
7:39
let's say half a year now. And I want to share this with you now because of the new capability unlocked by the 1 million
7:45
context window models. Inside of this memo, we had a question go in. Which shorts platform should we lead with? You
7:51
know, we're running this company called Blendstack. We needed to answer the question, where should we put our marketing efforts in terms of our shorts
7:57
channel? So, this is just one of many, many, many business decisions you might have to make. All right, so we have a final decision here. Here you can see
8:03
our CEO agent put together a decision map. Really broke things down for us here in a very visual way. We then have
8:10
our top three recommendations here. Fix the retention engine. Then YouTube shorts. So it looks like the awareness
8:15
of having multiple agents debate created a lot of value here. It didn't just select a shorts platform. It said you
8:21
actually have a retention platform issue. Fix that first otherwise nothing else matters. Right? So great call up
8:27
there. You can see the stances of every single one of our board members. So, this is where a lot of the value lies.
8:34
Every one of these board members has their own unique position, their own opinion, their own stake in the matter.
8:40
And we have my favorite one down here, the moonshot agent, which you'll see why as we work through this. Our memo also
8:46
points out the resolved and unresolved tension between all the members. Remember, this is a multi- aent
8:53
adversarial pattern or adversarial tool. The whole point is that we have multiple
8:58
perspectives that don't agree. So we can really flesh out the mental model that we need to make the best decision
9:04
possible and specifically that our CEO needs to make the best decision possible. And then we can just look at the conversation as a kind of observer
9:11
above it all. And we can use this to make high leverage decisions. You can see trade-offs and risks, next actions, so on and so forth. Everything you would
9:17
want in a strategic decision-making partner is here. [music]
Customize Pi Agent Harness
9:25
Let's boot this up from scratch. I'm going to really show you what it looks like to make a high lever decision with
9:31
this tool. As usual, I use just file to set up repeat agentic processes. If I
9:37
type J, which is a alias for just, you can see we have the CEO command. If we type J CEO, you can see the exact
9:43
command that that kicks off. We're moving into the app and then we're running this as a PI extension. Right away, we're presented with our CEO and
9:51
board, our strategic decision-making multi- aent team. We have a couple of constraints. Constraints are really
9:57
important for making real decisions because in reality the world always applies constraints to us. And the nice
10:02
part here is for the first time ever we can actually apply real constraints to the duration and the budget of our
10:08
meetings. The first thing to note about this system is that this is not your normal agent harness. If you try to prompt something, it will not accept it.
10:15
This is not a conversation. This is a oneshot multi- aent system. So the only command we can run here is CEO begin.
10:23
Let's fire this off. The first thing this does is it looks for briefs. So, we'll break down the codebase in a second, but you can see here I've got a
10:29
few different briefs. I've been testing a few different questions and problems that I want to present to this multi-
10:35
aent team. Let's go ahead and run a classic one, a big decision for every successful product is acquisition
10:41
offers. All right, so let's go ahead and run this and then we'll break down the inputs and outputs as this executes. As soon as we hit this, CEO first gathers
10:48
context. After it has the full picture, you can see it's updating its mental model. its personal memory file, its
10:55
scratch pad, and it's just going to write down a couple key facts here. It's going to take some notes on the question and answer, and then it's running its
11:01
converse tool. And so, you can see the CEO is writing to everyone at the head of the table, and it's announced
11:07
something. Board, we're here to make a call on neutral holdings acquisition offer. And then we have our multi- aent
11:13
team, board members, revenue, technical architect, compounder, product strategist, contrarian, moonshot.
11:18
They're all responding in parallel at the same time thinking through how they
11:24
would solve this problem and giving feedback to the CEO. And so this process is going to repeat as long as there is
11:31
time and budget. We're looking for that $2 to5 minute range before we start wrapping things up. And then we have a
11:37
$1 to $5 constraint. Uh just to be super clear, I normally run this with a much
11:43
much higher budget and constraints. I prioritize high leverage decisionm much
11:48
more than I prioritize uh time and compute costs of course up to some threshold. It's going to be different
11:53
for every engineer. Our agents are starting to work and respond to our CEO. And this of course runs in parallel,
12:00
right? This isn't sequential. Our agents aren't blocked. They're all thinking. They're all forming their own opinions based on their system prompt, right?
12:06
Based on their own internal thoughts and memory files. And so you can see things start to tick up there. Uh product
12:11
strategist has responded here. 12 cents for that. These are all running the sonnet model and I put the opus model on
12:17
our CEO. Every staff member has responded and now our CEO is going to iterate and so we're still in time.
12:23
We're still in budget. So our agent is updating its internal notes here. And you can see here the moonshot has
12:28
rejected as it often does. The moonshot wants to go bigger. It's looking for that moonshot opportunity in this
12:33
decision. But you can see here uh the room is 4:1. And so our CEO is continuing the conversation broadcasting
12:39
out to its multi- aent team and it wants to push the discussion further. That's the core process, right? As long as
12:45
we're in time and in budget, the system is just going to keep churning. They're going to keep finding all the holes, all
12:51
the cracks, and come to a concrete decision on our question, on our brief. So, this is a good time to kind of dive
12:57
in and understand the inputs and the outputs of the system, right? Because this is a unique multi- aent application
13:03
that's going to deliver unique results. So, it must be designed in a unique way. This is one of my big problems with all
13:09
the out of the box agents, all the cloud codes, all the codeexes. If you don't specialize them and you don't build
13:14
custom agents inside of them, you're getting the normal distribution of what everyone else is building. Especially if you're writing super short, super simple
13:21
props, you're really relying on everything else you've built to make that context and therefore the result
13:26
specialized just to kind of give it away a little bit. That second big innovation is a customizable agent harness like Pi.
13:34
There are many coding agents, but this one is mine. That's the value proposition. That's the big second
13:39
unlock here is a customizable Asian harness where you're not just doing this normal prompting back and forth in the
13:45
loop blah blah blah. This is old news. There's much more you can do, especially when you add the 1 million true context
13:53
into your system. All right, so our agents are responding. The compounder looking for that competitive compounding
13:58
advantage is responding here. Looks like it's going to generate an SVG to aid its argument here. We've gone over that
14:04
5minute mark. So, what's going to happen here is on completion of this message, our agent harness is going to add a
14:11
response block back to the CEO and it's going to tell the CEO, hey, we're moving over on time andor budget. It's time to
14:17
wrap things up for all the cost minmaxers, $2.50, not bad at all. Very,
14:22
very cheap. The real incredible part is, as mentioned, these models, 1 million tokens available to you with, you know,
14:29
Cirrus intelligence, the cost is never going to go up. It's steady cost. I've always been so annoyed with the Gemini
14:35
models. They always increase the price after 200K. Enthropic has broken that barrier. And if you're operating in claw
14:42
code, of course, you now have access to these 1 million context models by default. In Loop, the advantages are
14:49
obvious, more context. But outloop the advantages are much less obvious, right? When you build powerful tools like this
14:55
and you plug it up to your Outloop system, the leverage you can get is now massive. There we go. Okay, max reached.
15:01
So we are over in time. The CEO is going to end the deliberation. It's going to end the debate. It's prompting everyone.
15:07
We've hit our constraint. Final position. One statement each. So every agent now, every board member is going
15:13
to give their final closing statement on what they think we should do with this question, with this brief, with this
15:20
problem that we're presenting to our multi- aent team, our CEO and board. They're going to follow the normal process. Let's go and jump into the
15:26
system so we can understand how this actually works. [music]
Pi Codebase Breakdown
15:33
So, as mentioned, uncertainty in, decision out. We put in a brief and we get a memo out. So, this application
15:39
runs inside of its own app. Here you can see we have the extension right here. It's a single extension and it's quite
15:45
massive. I need to actually break this out. The real value and the real customization happens here. If we open up Pi, we have CEO agents. This is
15:53
interesting right away. We're all used to the doclaw directory. You have agents, you have plugins, you have commands, you have skills. With the PI
15:58
agent harness, you can make your own structures. You're not limited to what currently exists. So, we have a brand
16:04
new set of files here. We have our own agents. We have our own configuration file. We have our own expertise. More on
16:11
that later. And then we have the three essential nodes of the system, right? Our briefs, which is our prompts, and
16:17
then our memos, which is the response from our system. And then the middle step, right? The deliberation, also just
16:22
known as the debate. So, you can see here I've had several previous debates. Let's go ahead and start with our configuration file. So configuration
16:28
file has a few key notes. We have our meeting which sets up all the constraints. We have our brief sections.
16:34
So these are the sections that are brief must have. So we're applying prompt engineering best practices as part of
16:41
the system. So if we try to execute a brief that doesn't have key questions, it's not going to run. And then we have
16:47
our paths, right? So these are just references to our briefs, our debates, our memos, and our agents. And then of
16:53
course we have our customizable board members. And so you can see I left two out. Feel free to add them. And then we
16:59
have our remaining agents. And each one of these is their own system prompt. And you can see our memo opened up here. And
17:06
we're working through an acquisition offer. All right. So we're a business that's been presented with a acquisition
17:12
offer from Neutra Holdings. The board recommends accepting Neutra Holdings $12 million acquisition offer
17:18
at 11 times ARR. The vote was 5 to1 in favor with three conditions. A retention
17:23
linked earnout of $ 1.5 to$2 million, a 90-day knowledge transfer period, and a founder clarity question on whether the
17:30
retention signal was ever tested. Moonshot dissented, arguing the blend engine is platform infrastructure worth
17:35
far more. But nobody in three rounds could name the root cause of five quarters of decelerating growth. And
17:41
that silence was the signal. O, yeah, declining revenue. That silence was the signal. Okay, brutal. Another
17:47
final decision made. We got a decision framework. We have that summary file. And we have our memo, the most important
17:53
piece, the output of this system, full board memo with recommendations, stances, tensions, and next actions. So,
18:00
let me be super clear here about what we have. This is a decision-making agentic coding tool. And really, we're not
18:06
coding at all here, right? This is an agentic engineering tool. We're starting to uplevel the conversation about what
18:13
our agents are doing. We're engineering and solving problems with our agents.
18:18
We're not just coding anymore. As time goes on, I really want you to pay attention to this trend. Your agents can
18:23
do much more. This is why it's so important to pay attention to the core 4. This has been one of the biggest things I just haven't seen in the
18:29
industry. So, I wanted to bring it to you here and hand this idea directly to you. Your agents can help you make
18:35
strategic decisions. The system prompts you're going to see here are not normal system prompts. If we take a quick look
18:41
at the CEO system prompt, you can see that this looks very different from system prompts you're probably used to.
18:47
Why? Because we have once again specialized the experience. Our agent
18:52
harness knows how to parse this unique front matter from our system prompt from our agent which further customizes the
18:59
capability. Our CEO has expertise. It has skills and of course it's got a model and one more field here that uh
19:06
I'll leave for another day. Let's talk about the briefs, right? What was the brief that we input into the system? If we open up a new terminal, type JCEO and
19:14
we do CEO begin, you know, we use this acquisition offer brief. So this is how
19:20
the system works. So when you have a question, you'll come into the briefs section here. You'll use the brief
19:26
template. And of course, all my tactical agentic coding members know exactly why
19:31
we template things out. If you template your engineering, your agents can do exactly what you did, right? Exactly
19:38
what you did. This is the big advantage a lot of engineers have missed. When you're prompting back and forth and you're not creating prescriptions,
19:44
workflows, and systems for your agents to repeat, uh you miss out on all the
19:49
true leverage, which is templating your engineering into your systems and teaching your agents how to do what you
19:54
do. All right, so we have a brief template. You can kind of see the key structure there. And you'll notice how this aligns directly with the required
20:01
sections. So we have the debrief there. We have our stakes. We have our constraints and we have our key
20:07
questions. This is in our template. It's in our validation. And if we submit a brief into our system that does not have
20:15
these sections, it just rejects them. And so we are kind of forcing great prompt engineering as a pattern into the
20:21
agent harness. I'm specializing requirements for success. What does an actual brief look like? Let's see what
20:28
which one were we uh focused on there. Let me just grab this one here. Acquisition offer. And that's going to
20:33
be right here in briefs. And I'm going to save all these and push it to the codebase for all Agentic Horizon members
20:39
to access. But you can see here we have the brief. And what does this look like? This is how I am using agents to solve
20:46
problems and get direction on critical decisions. And near the end, we're going to talk about why just running this in
20:52
chatbt and claude in a single agent just isn't as impactful. It's okay. It's a great starting point for feedback. I'm
20:58
sure you've done it. I do it sometimes, but never for serious things where context is required. If you don't
21:04
context engineer the right information into your agents or or single agent,
21:09
it's not going to perform like you want it to. We've pushed this even further by having multiple agents. So, the brief looks like this, right? Nice and simple.
21:15
You can see this situation here. So, this is what our agent worked through. Should we take the 12 million acquisition offer? So, this is a private
21:21
equity company that is combining and rolling up purchasing [clears throat] supplement companies. made a formal
21:27
offer to acquire our company, Blend Stack. All right, so we are Blend Stack for 12 million cash. Kind of a low
21:32
stakes S&P exit. Still really good. That's 11x our current AR of 1 million non-negotiable. Price expires 30 days.
21:39
We have stakes, constraints, and we have the key question. We're forcing this
21:45
structure in all of our briefs. We want you, the engineer or any engineer on your team or any product member on your
21:51
team to really think through things. Don't just write a stupid two sentence prompt. Think. Give your agents serious
21:58
information to work with and it will give you a serious result. If you type in a lazy BS prompt, it'll do its best
22:05
cuz that's what it's been trained on, right? That's the RL that it just keeps getting hammered thumbs up or thumbs down. But if you really are serious in
22:12
your prompt engineering, and prompt engineering is very much still alive. Don't let anyone make you think that it's not. It will give you much better,
22:19
higher quality results, especially when you multiply it with multiple agents like we have here. But you can see here we also have additional files,
22:25
additional context for the business that's going to persist. So we have business metrics here. This is just
22:31
auxiliary information and product overview. Right? So what we are, we are blend stack, direct to consumer
22:36
supplement company. We let users build, you know, customizable supplement stacks, right? So pretty cool idea. This is a real mock of legitimate company
22:44
strategic decisions. There are companies that do exactly this out there in the wild, but I'll bet you they don't have agents to help them make critical
22:49
decisions. So we have that additional information here and this is what our brief looks like. So to be super clear, every single one of our agents, you
22:56
know, every single staff member receives all the extra context. So the CEO prompts them the key information from
23:02
the brief, but then every one of them is on the exact same page. They all load the key additional context, right? So
23:10
product overview, business metrics, they're all on the same page. This is key. This is very, very important. So
23:16
that's the brief. That's the beginning of our flow, right? Right? So if you hop back to our flow, uncertainty in,
23:21
decision out. The brief is the input. This is the prompt. This is the plan. This is the question. Now what comes out
23:26
is the memo. But there's something that sits here in the middle, the workflow. And that's where the deliberation is.
23:32
Also just known as, you know, the debate to put it in simple terms. But you can see here we have a bunch of middle stage
23:37
files. Most importantly is the conversation. Observability is a key element of building powerful agendic
23:43
systems. If you don't measure it, you cannot improve it. Full stop. So here we have the full conversation that
23:49
occurred. If we look at the CEO here and in fact as part of our staff's system
23:54
prompts where we constantly tell them reread the entire conversation so they know who's saying what to who and who's
24:01
responding right so we have the from and the to most of our conversation here is happening from the CEO to everyone and
24:07
then everyone or like you know the individual staff members are responding to everyone else. We can dial this in
24:13
further. Right now I have the system configured in a just simple call and response way broadcast mode. But you can
24:19
see how this could be valuable, right? Because in reality on real boards there is often what's called backroom talk or
24:26
behind the door under the table talk where the compounder and the moonshod they might want to converse about
24:33
something, you know, kind of behind everyone else's backs, right? And they might want to collude and find some middle ground, make some trade-offs
24:38
together and make a key decision. This is all good to help you make your key decision, right? You want those kind of like adversarial models, battling it
24:46
out, debating it out and once again just to expose flaws in your mental model and
24:51
your systems mental model of the brief and the memo the conversation here fully visible. We have our tool use of every
24:58
agent. So you can see you know we are pulling in right we should have a bunch of uh yeah path reads here have a bunch
25:04
of read tools and some agents will also write to their own personalized memory
25:10
file specifically an expertise file it's a bit distinct from memory memory is
25:15
quite vague but expertise is memory and patterns surrounding a specific problem and that's the third key innovation here
25:23
if I close this you can see I have this expertise file this is one of the big topics we discussed inside of Agentic
25:30
Horizon. All members of Agentic Horizon already know about this. You've known about this for a while now. But expertise is a really powerful pattern.
25:36
This isn't just arbitrary memory. It's not just memorize this. It's based on your domain expertise, the thing that
25:42
you focus on the most. And so I have this in a very simple form here. You can see here's the CEO scratch pad for this
25:48
session. Of course, I have this as a presentational example for you to get started with. But in my real versions of
25:54
my multiple CEO agents, I have multiple versions of this depending on the product tool, client work that I'm
26:00
doing, I have CEO agents that are tracking a whole slew of working
26:06
expertise. The kind of real production expertise files that I have running are, you know, tens and thousands of tokens.
26:11
And I was able to [laughter] expand their mental model so much because of these new powerful 1 million context
26:19
window models. This truly changes the types of multi- aent experiences you can
26:24
build, the types of agentic engineering that you can do. So anyway, that's the expertise file. These are kind of, you
26:30
know, the middle state of what's going on. And you'll notice here we also have some SVGs. All of our agents can create
26:36
SVGs to their argument. The revenue agent created this multi-year plan thinking about what must go right to
26:42
beat $12 million in a future exit. Year 1, year 2, year three. And it's got these bull base bare case laid out like
26:49
a great investor or like a great board member would think through. It's really just kind of pointed out 12 million
26:55
today is an excellent offer given everything that's going on in the bull case and the bare case. Every agent can
27:03
create SVG elements to visually compel the CEO toward their argument. So very
27:08
very powerful here. I hope you can see that I am going to beat the out of the box agent experience, right? Like I hope
27:14
that's not like even a question for you. Having multiple agents inside of your system is a massive advantage. When you
27:22
add multiple agents in your pipeline to help you solve a specific problem, you get multiple perspectives. And frankly,
27:28
you multiply the amount of context, the angle, the perspective of the ability to
27:34
solve a certain problem. It's no different than having a great, you know, diverse team with different opinions. If
27:40
you get a bunch of Chads on your team, every Chad is going to say, "Yeah, we should use React." You you really want
27:46
these unique perspectives. You want to build them into, you know, your own agent harnesses, your own customized
27:51
agentic experiences. Okay? And that's why PI Asian harness is a really big
27:56
piece of that. And we've done it here in 2,000 lines of code. I do need to break this up a little bit cuz it's quite
28:02
large. 2K lines is is not a great design pattern here. So, I'm going to clean this up. We have our memo. So, let's
28:08
open this up again. You can see just very simple memo. We have our decision-m diagram here. Our CEO has said that we
28:14
should accept the offer. 12 million cash outcome. There's a condition. It's really broken this down for us. Rejected. The moonshot did not like
28:20
this. Everyone else is on the same page. Have a nice simple highle visual of the
28:25
decision. Thanks to the PI agent harness and thanks to our own customization. Our system takes in brief markdown files in
28:31
a very specific format, right? And a memo with an SVG and an MP3. So very, very concrete unique inputs and outputs.
28:38
We've built a unique system here. I harp on this a lot every single week on the channel, but it's so critical. If you're
28:44
not building specialized agents, context model prompt tools, and you're not going high level and customizing your agent
28:50
harness, you are in the normal distribution of what everyone is getting out of the agents. Right now, the big
28:55
mainstream is the cloud code agent running these powerful opus and sonnet models. It doesn't take a lot to push
29:01
out that distribution just a little bit. You have the core four. Change one of them. Change two of them. Don't just rely on your context being different. We
29:08
can dial into the full memo here and really get a great breakdown of the full decision in that exact output format
29:15
that we've specified. That's the memo. Let's understand that we've customized the system prompt. We do have a
29:22
traditional system prompt in the format that you've seen on the channel over and over and over. Consistency is a
29:28
extraordinarily powerful tool. Purpose, variables, instructions, workflow, context, report. All right. And this is
29:35
in the system prompt. You can see here I have a bunch of static variables and I have runtime variables. So I have
29:40
dynamic variables that get updated before this agent starts in the system prompt. So we are updating dynamic
29:46
variables inside the system prompt so that after it boots up, our agent is aware of this. We also have dynamically
29:52
inserted a couple additional things, expertise and skills. So these are all
29:58
getting added. I'm modifying that normal agent coding experience that you're likely used to and doing it a specific
30:05
way. How can I do this? It's because I know the actual primitives underneath the tool. This is where vibe coders have
30:11
no shot. They cannot build something like this. The awareness just isn't there. You can go all the way down to
30:16
the prompt level, the system prompt level, and you can redesign how things work. If you dive into the code, you'll
30:22
see that I take the skill block here that I can just quickly update from the front matter of the agent, update it,
30:28
and I add it directly to the system prompt on bootup. And of course, we have the tool breakdown here for our primary
30:35
agent. We don't need to go into too much detail here, but you can imagine the rest of everything, but the key piece here is that our CEO and the rest of our
30:42
agents, right? Like here's the compounder agent. There's a model skills expertise file. Similar format, similar
30:48
structure, expertise, skills, runtime, yada yada yada. The key piece here is that we are strongly defining and we're
30:54
to be super clear, we're completely overwriting the system prompt. These are not coding agents. This is a CEO and a
31:00
board built to make strategic decisions on your behalf. One of many, many, many thousands, tens of thousands of
31:06
specialized agents that can be built. Coding is just the beginning. It's really just the beginning. It's a lot
31:13
like vibe coding. It's the lowest hanging fruit because there's much more domain out there for you and I to
31:18
access. All right. So anyway, this pattern repeats. Basically, I've created my own system prompt structure with
31:24
front manner that my customized Asian harness parses. And then from there, it's classic system prompt prompt
31:31
engineering. And so, you know, scroll down, you can see I've got temperament, how this role thinks, reasoning
31:36
patterns, decision-making heruristics, and you know, my favorite, if we go to the uh where's our moonshot agent here?
31:42
You know, the moonshot agent is our big bet thinker, and I love this line. What if we're thinking too small? You
31:47
advocate for 10x moves, category defining bets, the risky play that changes the trajectory of the entire
31:53
business if it works. You can see that in the decision that was made in this last brief here. Our moonshot agent was
31:59
the only one that said, "Reject and run a 30-day investor test. See if we can raise some more funding. See if we can
32:06
keep pushing." And so, I love the moonshot agent. It's helped me think even bigger. Like, think long term.
32:11
think what if you expanded beyond what you're doing right now. So anyway, that's just one of many personalities that you can build into your staff team
32:18
because you know you can customize this completely. Moonshot contrarian product strategist compounder thinking about
32:24
compounding advantages and a revenue agent is really interesting as well. The revenue agent just wants cash now
32:29
gravitational pull towards shipping, selling and collecting money. I want a version customers will pay for in 90
32:35
days, right? Maximize within the next 90 days. And this comes down to even more
32:40
details, right? Temperament, how this role thinks, reasoning patterns, so on and so forth. That's how this system
32:46
works. Great part about this system is that they're going to retain knowledge. These are not normal agents. These are
32:51
agent experts. You saw that scratchpad file. I've built that out to be much more persistent. In reality, we're not
32:58
going to be jumping around making decisions against different business domains. We have our briefs here, right?
33:03
These are all different business domains, right? different uh samples to showcase how this works, to showcase how
33:09
you can deploy a multi- aent team against specific decision sets. In reality, what you're going to end up with is a chain and a stack of decisions
33:17
and questions and answers, briefs and memos that you and your teams have decided over time. And that's where
33:23
there's real value. It's in that specialization of stacking context that only you and your agents and your team
33:31
has. I have a code bases where I have like 20 briefs and that means the expertise becomes more and more
33:37
valuable. So I have versions of the CEO agent where the revenue agent has you know a long log file like this much much
33:44
longer than this but decent amount of tokens here actually 11K it's taking notes on all the other members and it
33:49
kind of knows who it likes to agree with who it disagrees with often and for instance you know a pattern that I see which makes sense the revenue agent is
33:56
often at odds with a compounder agent thinking sub90day prioritization range
34:02
is typically at odds with a compounder who's thinking how can we compound this advantage over multiple multle quarters
34:08
and multiple years. So, it's funny to see, you know, the agents actually taking notes, kind of colluding against
34:13
each other a little bit. You want your agents opposing each other at odds so that they poke holes in each other's
34:19
strategy, which ultimately give you and your CEO every piece of information they need to create the best memo, aka the
34:26
best answer to your question, the best solution to your problem. Something important to note here as well, you saw
34:31
that I'm exclusively using clawed models here. agent model diversity is super
34:37
super important for creating better conflict and unique opinion. Overriding the system prompt does get us a lot of
34:43
that value. But what we really want here is you know be great if OpenAI or Gemini was putting out true 1,500 700K token
34:52
window models so that they could you know really be a part of this. But the key here is the models must be able to
34:58
maintain long context so that they can maintain and execute on tons of information about your business, about
35:05
your product, about your life. That's the kind of key piece here. If they can't have it in their memory, their working memory, their context window,
35:11
you're kind of limited to the size of problem you can really ask them to give you a concrete opinion on, right? And a
35:18
concrete solution on. But that's important here. Sometimes I do for my smaller products I will actually drop
35:24
down some of these models. For instance, the GBT 5.4 very powerful and Gemini 3.1 Pro very powerful but only up to like
35:31
500K. You know, I hope it's clear here that specialization is the advantage and specialization once again increases the
35:37
trust we have in our agents because you've designed a system to create and maintain certain inputs and outputs. And
35:43
you know, we can just kick off another one here. We got an FDA warning. FDA sent us a warning about our supplement
35:49
company. you know, we just kick that off. And so this really is a new frontier of capabilities. The sonnet
35:54
models with the 1 million context length. This changes things. This model in itself really does change the
36:00
landscape. If you're doing normal inloop agent decoding, it's pretty obvious that you can just add more context and you'll
36:06
have to compress less, which is massively valuable. But this goes even further. When you build your own custom
36:11
agent harness, let's be super clear. These are micro applications that do one thing extraordinarily well, the agentic
36:17
way. So that's what PI unlocks. And the last piece here is agent expertise. You
36:22
can now have your agents track very, very long scratch pads, memory files,
36:28
specifically expertise that helps them get an advantage in whatever situation
36:33
you're putting that specific custom agent in. All right, so these are the three innovations I want to sit down and
36:38
talk with you today about. Let me be super clear. 1 million true context window thanks to the Opus and Sonnet 4.6
36:45
series. We have customized agent harnesses. Once again, I'll link the video where we break down PI coding
36:51
agent versus cloud code. PI is one of the only models I see as a true Claude
36:56
code competitor because of the customization. And then we have agent expertise. Thanks to that extended
37:03
context window, your agents can remember and get on the same page as you about
37:09
your product, your business, so on and so forth. And so you can see once again our agents are creating their unique
37:14
opinionated response to the FDA warning [laughter] that this hypothetical
37:19
business received. All right. And so they're going to go on and help me make a critical business decision. So this codebase is available exclusive to
Tactical Agentic Coding
37:26
Tactical Agent Coding and Agent Horizon members. For new engineers that don't know what this is, welcome. I don't sell
37:32
or receive any sponsorships. The only thing I sell is handcrafted courses for
37:38
mid to senior level engineers. engineers that ship to production. This is my take on how to scale far beyond a coding and
37:45
vibe coding with agentic engineering so powerful your codebase runs itself. You're starting to see big labs really
37:52
catch up and implement these ideas. This course is unique in that it's not about cloud code. It's not about any specific
37:58
tool. This is about agentic engineering. It's about building the system that builds the system. All right. Some of
38:05
the big ideas we talk about outloop agentic engineering. Stop sitting in the terminal prompting back and forth and back and forth. Teach your agents how to
38:11
build your way, right? Template your engineering. As we mentioned in the beginning, we talk about the key leverage points that change your impact
38:18
and much more. Okay? We build a system that builds the system. I built this channel and and this course in the same
38:25
mindset, the same frame every single week. I aim to be your favorite engineers's favorite engineer by really
38:32
sitting down and dialing in and breaking down what you can really do with this technology. All right, so to be super
38:37
clear, there are two courses in here. There's the base course, tactical agent coding, and then there's the second
38:43
extended course, all right, Agent Horizon. I'm going to release the CEO and board agent tool for Agentic Horizon
38:50
members. So, you have to have both of these to gain access, but it'll be well worth it. We talk about big hitting ideas you've seen all over the AI
38:57
industry and some that you haven't. All right, one of the big ones being agent experts. This is phase two and it's
39:04
really, really important to get on top of this stuff because phase three is coming. Everything we're going to be
39:10
doing in phase three is going to build on top of everything we've done in phase two with aentic coding and agentic
39:16
engineering as a whole. So, this is here if you're interested, if you understand that valuable things are not always
39:22
free. The course is there if you're interested. You can see here my CEO and board is continuing to work. For
39:29
everyone else, I'll hold this here for a second. Go ahead and take a screenshot. Try to get your your Cloud Code agent to
39:35
reproduce the whole thing. Good luck. I'll also link the PI coding agent video in the description that broke down the
39:41
opportunity available for engineers that want to customize their agent harness and get an additional advantage. We are
39:47
in the age of agents. The engineers that can scale and use compute in the form of agents are the engineers that are and
39:54
will win. You know where to find me every single Monday. Stay focused and keep building.
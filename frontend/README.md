# Speech System // Frontend
Vite/React based frontend for the speech system. To run it:
1. `cd` into the `frontend` directory
2. `npm install` (only need to do once if you haven't already)
3. `npm run dev`


## Page Reworks (high level, still components missing on some):
```diff
Pages

- Chat
+ ChatDetails
+ Dashboard ("Speech Analysis" Page)
+ Login / Signup
- ProgressSummary (robot, prog bar, info, games)
+ Schedule

```


## ToDo:
<details closed> <summary> <b>To Do</b> </summary>

* Do stuff when there are no chats 

* Theme 
    - universal color sources (change depending on patient/caregiver)
    - font size - throughout the project font size should be relative and then there should be like a global font size we can adjust

Differentiation between patient and caregiver profiles
* Add a bootstrap "theme" to switch things from blue or purple
* Header when signed in as a patient

Database related stuff
* "sentiment" field of the ChatSession model isn't correct
* Add "auto_renew" to Goal in the database
    - means we have to do this in a few spots: `models.py, serializers.py, models.ts`
* Can we set a value for if the user is a patient inside AuthContext or whatever and then import it...?


Misc.
* Add a refresh chats utility
    - call it when leaving the Chat page to make sure the new chat is on the Dashboard
    - add a button to the dashboard to also call the refresh thing

* Chat Page
    - Fix the stuff going on top of the buttons
    - Buttons could be a lot cleaner
    - Too many react updates going -> sometimes messages appear out of order

* Move files around / remove old
    - functions
    - components

</details>


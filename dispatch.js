(() => {
  'use strict';

  const contracts={
    libraryKit:{
      title:'Soundcheck Supplies', pickup:'books', drop:'libraryStage', item:'micKit', pay:18, activity:'library',
      brief:'Carry a cable and spare batteries to the guitar set on Library Mall.',
      rush:{activity:'library',size:5,note:'The Library Mall audience is growing.'}
    },
    statePrints:{
      title:'Posters for State Street', pickup:'libraryStage', drop:'stateStage', item:'setPosters', pay:42, activity:'state',
      brief:'Bring the weekend set posters east along State Street.',
      rush:{activity:'state',size:5,note:'The State Street audience is growing.'}
    },
    squareSketch:{
      title:'The Sketch Circle', pickup:'monona', drop:'squareStage', item:'sketchKit', pay:30, activity:'square',
      brief:'Drop off pencils and spare sketchbooks at the Capitol Square gathering.',
      rush:{activity:'square',size:4,note:'The sketch circle has more people than supplies.'}
    },
    breeseCrew:{
      title:'Welcome Crew', pickup:'capitol', drop:'field', item:'meetupKit', pay:68, activity:'paterson',
      brief:'Take a box of name tags and neighborhood maps to the Breese Stevens meetup.',
      rush:{station:'paterson',size:6,note:'Riders are lining up at Paterson.'}
    },
    blairSurvey:{
      title:'On the A to Blair', pickup:'cheese', drop:'blairCrossing', item:'accessSurvey', pay:52, unlock:2, arrival:'blair',
      brief:'Ride Route A to Blair and meet the survey crew at the crossing. Earn $12 extra for staying aboard through the ride.',
      rush:{station:'blair',size:4,note:'Blair has a busy platform to survey.'}
    }
  };
  const payout={rush:14,workshop:12,ride:12};
  const projects={
    noticeboard:{
      title:'Library Mall noticeboard',site:'libraryStage',price:65,shift:'libraryKit',
      activity:'library',interval:44,recruit:true,
      brief:'The Library Mall set starts more often and draws passersby from farther away.'
    },
    openMic:{
      title:'State Street open mic',site:'stateStage',price:95,shift:'statePrints',
      activity:'state',duration:22,capacity:15,
      brief:'Give State Street sets a longer slot and room for more listeners. Some of that larger crowd will head to Route A.'
    },
    blairSignal:{
      title:'Blair crossing fund',site:'blairCrossing',price:110,shift:'blairSurvey',
      crossing:'blair',
      brief:'Shorten the time between eligible walk phases when riders are waiting at Blair.'
    }
  };

  function quote(contract,readCity,hasWorkshop) {
    const {rush}=contract;
    const demand=readCity(rush);
    const busy=demand>=rush.size;
    return {busy,pay:contract.pay+(busy?payout.rush:0)+(hasWorkshop?payout.workshop:0),note:busy?rush.note:''};
  }

  window.MadisonDispatch={contracts,projects,payout,quote};
})();

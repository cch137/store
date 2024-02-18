const {default: store} = require("../dist/index.js");

(async () => {
  const x = store({name: 'Alex', age: 9}, {resettable: true, init() {return {name: 'Ali'}}});
  x.$on(() => console.log(x));
  x.name = 'Bob';
  await x.$reset();
  await x.$init();
  x.name = 'Jack';
  console.log('FINAL:', x);
})();
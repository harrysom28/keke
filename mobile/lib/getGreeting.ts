export function getGreeting() {
  const hours = new Date().getHours();
  let greeting;

  if (hours < 12) {
    greeting = "Good morning, ";
  } else if (hours < 18) {
    greeting = "Good afternoon, ";
  } else {
    greeting = "Good evening, ";
  }

  return greeting;
}

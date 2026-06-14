import { useEffect } from "react";
import { useRouter } from "expo-router";

/** Legacy route — email signup lives on /signup with the Email & Password tab. */
export default function EmailSignUpRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/usertype");
  }, [router]);

  return null;
}

"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginInput } from "@/lib/validations";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-pstbg font-body">
      <div className="flex min-h-[64px] items-center bg-navy px-4 md:px-6">
        <p className="font-heading text-lg font-bold text-white">
          Site Tracker
        </p>
        <span className="ml-3 font-meta text-xs text-white/70">
          Project Site Tracker
        </span>
      </div>
      <main className="flex flex-1 items-center justify-center p-4">
        <Suspense>
          <LoginCard />
        </Suspense>
      </main>
    </div>
  );
}

function LoginCard() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setError(null);
    const res = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (res?.error) {
      // Error toast region (aria-live) for invalid credentials.
      setError("Invalid credentials. Please check your email and password.");
      return;
    }
    // The home route chooses the correct landing page from the signed-in role.
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-navy">Sign in</CardTitle>
        <CardDescription>
          Use your tracker email and password to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
            <div
              role="alert"
              aria-live="assertive"
              className={
                error
                  ? "mb-4 rounded-input border border-overdue/40 bg-red-50 p-3 text-sm text-overdue"
                  : "sr-only"
              }
            >
              {error ?? "No errors"}
            </div>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="you@tracker.local"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="min-h-[44px] w-full bg-steel font-body font-semibold text-white hover:bg-steel/90"
                >
                  {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
      </CardContent>
    </Card>
  );
}

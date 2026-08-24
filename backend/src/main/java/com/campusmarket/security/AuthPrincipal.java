package com.campusmarket.security;

import java.lang.annotation.*;

/** Injects the resolved {@link Principal} into a controller method parameter. */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AuthPrincipal {
}

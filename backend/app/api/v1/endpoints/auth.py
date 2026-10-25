from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.permissions import AuthenticatedContext, csrf_protect, get_current_user
from app.core.security import generate_csrf_token
from app.db.session import get_db
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, raw_session_token: str) -> None:
    csrf_token = generate_csrf_token()
    max_age = settings.ABSOLUTE_TIMEOUT_HOURS * 3600

    # HttpOnly session cookie (inaccessible to JavaScript)
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_session_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=max_age,
        path="/",
    )

    # Readable CSRF cookie for Double-Submit Header validation
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=max_age,
        path="/",
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new trainee account",
)
def register(
    req: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user, raw_token, permissions = AuthService.register(
        db=db,
        email=req.email,
        name=req.name,
        password=req.password,
        ip_address=client_ip,
    )

    _set_auth_cookies(response, raw_token)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        permissions=permissions,
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in with email and password",
)
def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user, raw_token, permissions = AuthService.login(
        db=db,
        email=req.email,
        password=req.password,
        ip_address=client_ip,
    )

    _set_auth_cookies(response, raw_token)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        permissions=permissions,
    )


@router.post(
    "/logout",
    dependencies=[Depends(csrf_protect)],
    summary="Revoke session and clear cookies",
)
def logout(
    request: Request,
    response: Response,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    AuthService.logout(
        db=db,
        session_model=auth_ctx.session,
        ip_address=client_ip,
    )

    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
    )
    response.delete_cookie(
        key=settings.CSRF_COOKIE_NAME,
        path="/",
    )

    return {"status": "logged_out", "message": "Successfully logged out."}


@router.get(
    "/me",
    response_model=AuthResponse,
    summary="Get current user profile and effective permissions",
)
def get_me(
    request: Request,
    response: Response,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user, permissions = AuthService.get_me(db=db, user=auth_ctx.user)

    # Ensure CSRF cookie exists if missing
    if not request.cookies.get(settings.CSRF_COOKIE_NAME):
        csrf_token = generate_csrf_token()
        response.set_cookie(
            key=settings.CSRF_COOKIE_NAME,
            value=csrf_token,
            httponly=False,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE,
            max_age=settings.ABSOLUTE_TIMEOUT_HOURS * 3600,
            path="/",
        )

    return AuthResponse(
        user=UserResponse.model_validate(user),
        permissions=permissions,
    )


@router.get(
    "/csrf",
    summary="Get or refresh Double-Submit CSRF token",
)
def get_csrf_token(
    request: Request,
    response: Response,
):
    token = request.cookies.get(settings.CSRF_COOKIE_NAME) or generate_csrf_token()
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.ABSOLUTE_TIMEOUT_HOURS * 3600,
        path="/",
    )
    return {"csrf_token": token}


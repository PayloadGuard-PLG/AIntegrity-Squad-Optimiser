# PRINCIPIA III
## The Experimental Mechanics of Resource-Coach Transfer
### Frozen pre-automation hypothesis, 22 September 2026

**Status:** calibration hypothesis; not a production law.

**Repository state:** PayloadGuard-PLG/AIntegrity-Squad-Optimiser, PR #149, pre-automation provenance/deduplication preview.

---

# I. Scope and notation

Let a preview experiment be

\[
E=(P,C,S,Y),
\]

with player state \(P\), coach state \(C\), affected-stat set \(S\), and observed interval vector \(Y\). For \(j\in S\),

\[
s_j=\text{displayed starting stat},\qquad
c_j\in\{W,G\},\qquad
Y_j=[\ell_j,h_j].
\]

For tier \(T\in\{T0,\dots,T6\}\),

\[
\Delta_T\in\{0,10,30,50,80,120,160\},
\]

and the tier-adjusted coordinate is

\[
u_j=s_j-\Delta_T\mathbf 1[c_j=W].
\tag{1}
\]

The coach multiplier is \(N>0\); \(p=|S|\); age is \(a\); programme family is \(F\); transfer class is \(R\).

\[
\widehat Y_j(\Theta)=[L_j(\Theta),U_j(\Theta)].
\tag{2}
\]

No midpoint is an observation.

---

# II. The deterministic response operator

## Proposition I - V2 is a deterministic inverse-integral map

Define

\[
\lambda_H(a)=\log r_{H,28}+m_H(a-28),
\]

\[
\lambda_L(a)=\log r_{L,28}+m_L(a-28),
\]

with

\[
K=39.4242478510,\quad
r_{H,28}=94.4864371028,\quad
r_{L,28}=79.1713401064,
\]

\[
m_H=-0.086605070821,\qquad
m_L=-1.114853525635.
\]

Set

\[
h(a)=K(\lambda_H(a)-\lambda_L(a)),
\tag{3}
\]

\[
b=e^{\lambda_L(a)}x.
\tag{4}
\]

Let \(d=\max(h-u,0)\), \(q=\max(u-h,0)\). Then

\[
\Psi(u,a,x)=
\begin{cases}
b,&b\le d,\\[4pt]
d+K\log\left(1+\dfrac{b-d}{K}e^{-q/K}\right),&b>d.
\end{cases}
\tag{5}
\]

Upper endpoint:

\[
x\mapsto \rho x,\qquad
\rho=1.515276306526.
\tag{6}
\]

Hence

\[
\widehat Y_j=
[\Psi(u_j,a,x_j),\Psi(u_j,a,\rho x_j)].
\tag{7}
\]

The repository regression suite verifies the closed form against independent numerical integration on 30 synthetic points to \(<10^{-7}\).

## Proposition II - Monotonicity

For admissible \(u,a,x\),

\[
\frac{\partial \Psi}{\partial x}>0.
\tag{8}
\]

Therefore inverse-exposure constraints are well-defined.

---

# III. Strongest surviving structural candidate

The 21 September candidate uses (1), but expresses the marginal cost directly:

\[
C_c(z)=
\begin{cases}
1,&z\le h_c,\\
\exp\{\beta(z-h_c)\},&z>h_c,
\end{cases}
\tag{9}
\]

with

\[
h_W=135,\qquad h_G=120,\qquad \beta=0.0354.
\tag{10}
\]

Latent movement \(J\) is determined by

\[
\int_u^{u+J}C_c(z)\,dz=D.
\tag{11}
\]

Displayed gain is rectified:

\[
g=\max(0,u+J)-\max(0,u).
\tag{12}
\]

Current shared-dose null:

\[
D_0(a,N,p,R)
=A(a)\kappa_R\frac{N^q}{p^\eta},
\tag{13}
\]

\[
q=1.056,\qquad \eta=1.073,
\tag{14}
\]

\[
A(a)=
\begin{cases}
8,&17\le a\le21,\\
6,&22\le a\le25,\\
4,&26\le a\le29,\\
2,&30\le a\le31,\\
1,&a\ge32.
\end{cases}
\tag{15}
\]

Diagnostic Reward factor:

\[
\kappa_{reward}=0.60.
\tag{16}
\]

Equations (13)-(16) remain falsifiable working values.

---

# IV. Failure of equal allocation

## Proposition III - Equal per-stat allocation is not sufficient

The current V2 exposure law is

\[
x_j^{(0)}=\frac{N}{p}\gamma_{c_j},
\qquad
\gamma_W=1,\quad
\gamma_G=0.685727303333.
\tag{17}
\]

For the live Gilmartin observation,

\[
a=19,\quad T=T3,\quad N=5,\quad p=3,
\]

\[
S=\{P,D,F\}
=\{\text{Passing, Dribbling, Finishing}\},
\]

\[
(s_P,s_D,s_F)=(252,245,153),
\]

\[
(c_P,c_D,c_F)=(W,W,G),
\]

\[
(u_P,u_D,u_F)=(202,195,153).
\tag{18}
\]

Observed intervals:

\[
Y_P=[1,2],\qquad
Y_D=[4,5],\qquad
Y_F=[5,7].
\tag{19}
\]

V2 equal-allocation prediction:

\[
\widehat Y_P^{V2}=[1.9929,2.9818],
\]

\[
\widehat Y_D^{V2}=[2.3687,3.5358],
\]

\[
\widehat Y_F^{V2}=[4.5811,6.7489].
\tag{20}
\]

21 September candidate:

\[
\widehat Y_P^{C}=[1.2294,1.8247],
\]

\[
\widehat Y_D^{C}=[1.5657,2.3172],
\]

\[
\widehat Y_F^{C}=[3.9044,5.6712].
\tag{21}
\]

The candidate explains Passing but under-allocates Dribbling and Finishing. V2 preserves the total response more closely but allocates it incorrectly.

---

# V. Algebraic cancellation inside one preview

## Proposition IV - Passing and Dribbling isolate a missing within-session term

Within (18)-(19), Passing and Dribbling have identical

\[
a,T,N,p,c,W,F,R,
\]

and differ only by stat identity and starting coordinate:

\[
u_P-u_D=7.
\tag{22}
\]

Observed midpoint ratio:

\[
\frac{m_D}{m_P}=\frac{4.5}{1.5}=3.
\tag{23}
\]

Under the current V2 response law, the exposure ratio required to reproduce those midpoints is

\[
\frac{x_D}{x_P}
=
\exp\left(\frac{u_D-u_P}{K}\right)
\frac{e^{m_D/K}-1}{e^{m_P/K}-1}
=2.6106.
\tag{24}
\]

Equal allocation imposes

\[
\frac{x_D}{x_P}=1.
\tag{25}
\]

Hence (24) and (25) are incompatible.

---

# VI. Raymond's allocation hypothesis

## Hypothesis H_R

A coach programme first generates a scalar session dose; that dose is then distributed non-uniformly across the affected set.

\[
D_F=D_F(a,N,p,R,C).
\tag{26}
\]

Define a positive allocation vector

\[
\boldsymbol\omega=(\omega_j)_{j\in S},
\qquad
\omega_j>0,
\qquad
\sum_{j\in S}\omega_j=p.
\tag{27}
\]

Then

\[
x_j=\bar x_j\omega_j,
\tag{28}
\]

where \(\bar x_j\) is equal-allocation exposure generated by the programme-level law and class transform.

The deterministic response is unchanged:

\[
\widehat Y_j=
[\Psi(u_j,a,\bar x_j\omega_j),
 \Psi(u_j,a,\rho\bar x_j\omega_j)].
\tag{29}
\]

Nested null:

\[
H_0:\quad \omega_j\equiv1.
\tag{30}
\]

Experimental hypothesis:

\[
H_R:\quad
\exists j,k\in S:\omega_j\ne\omega_k.
\tag{31}
\]

---

# VII. Minimal role-conditioned allocation

The smallest role-sensitive model to test is

\[
z_j=\theta_{r_0,j},
\tag{32}
\]

where \(r_0\) is the player's original, leftmost role.

Normalize by softmax:

\[
\omega_j
=
\frac{p e^{z_j}}
{\sum_{k\in S}e^{z_k}}.
\tag{33}
\]

Only after falsification of (32):

\[
z_j=
\theta_{r_0,j}
+\sum_{r\in R_*\setminus\{r_0\}}\lambda_{r,j}
+\phi_{F,j}
+\chi_{C,j}.
\tag{34}
\]

No term in (34) is admitted merely because retrospective loss falls.

---

# VIII. Live inversion of the allocation vector

For monotone \(\Psi\), define inverse exposure

\[
X(u,a,g;\rho_e)=\Psi^{-1}(u,a,g;\rho_e).
\tag{35}
\]

The V2 base exposures are

\[
\bar x_P=\bar x_D=\frac53=1.6666667,
\]

\[
\bar x_F=\frac53\gamma_G=1.1428788.
\tag{36}
\]

A representative constrained solution satisfying (27) is

\[
\boldsymbol\omega^*
=(0.49,\;1.47,\;1.04),
\qquad
\sum\omega_j=3.
\tag{37}
\]

Substitution into the unmodified deterministic V2 response gives

\[
\widehat Y_P(\omega^*)=[0.9891,1.4893],
\]

\[
\widehat Y_D(\omega^*)=[3.4347,5.0941],
\]

\[
\widehat Y_F(\omega^*)=[4.7537,6.9962].
\tag{38}
\]

Every interval in (38) intersects the observed interval in (19).

\[
\operatorname{MAE}_{end}(\omega^*)=0.2385,
\tag{39}
\]

versus

\[
\operatorname{MAE}_{end}(H_0)=0.9567.
\tag{40}
\]

Equation (37) is an existence proof, not a recovered game constant.

---

# IX. Session dose and allocation are distinct identification problems

Let the programme generator be

\[
D_F=
A_F(a)\kappa_R\xi_C
\frac{N^{q_F}}{p^{\eta_F}}.
\tag{41}
\]

Let allocation be \(\omega_j\). Then

\[
x_j=D_F\,\Gamma(c_j,u_j)\,\omega_j.
\tag{42}
\]

The model is not identifiable if \(D_F\) and \(\omega\) compensate freely. Therefore enforce

\[
\sum_{j\in S}\omega_j=p
\tag{43}
\]

for every preview.

Under (43), \(D_F\) controls total dose; \(\omega\) controls only within-preview allocation.

---

# X. Deterministic optimizer

For experiment \(e\), stat \(j\), observed interval \([\ell_{ej},h_{ej}]\), define endpoint loss

\[
\mathcal L_{ej}(\Theta)
=
[\log(1+L_{ej}(\Theta))-\log(1+\ell_{ej})]^2
+
[\log(1+U_{ej}(\Theta))-\log(1+h_{ej})]^2.
\tag{44}
\]

This preserves the optimizer's existing log1p endpoint geometry and does not fit interval midpoints.

\[
\Theta^*
=
\arg\min_{\Theta\in\Omega}
\left\{
\sum_{e\in\mathcal C}
\sum_{j\in S_e}
\mathcal L_{ej}(\Theta)
+
\lambda\|\Theta\|_2^2
\right\},
\tag{45}
\]

subject to

\[
\omega_{ej}>0,
\qquad
\sum_{j\in S_e}\omega_{ej}=p_e.
\tag{46}
\]

Primary interval-separation metric:

\[
d_I([L,U],[\ell,h])
=
\max(0,\ell-U,L-h).
\tag{47}
\]

A preview is interval-compatible iff

\[
d_I=0
\quad\forall j.
\tag{48}
\]

Nested model order:

\[
H_0
\subset
H_{stat}
\subset
H_{r_0\times stat}
\subset
H_{roles}
\subset
H_{family}.
\tag{49}
\]

---

# XI. Frozen pre-automation prediction

\[
\boxed{
\text{Response geometry is substantially correct; equal dose allocation is not.}
}
\tag{50}
\]

More precisely,

\[
\boxed{
\text{programme dose}
\rightarrow
\text{normalized stat-allocation vector}
\rightarrow
\text{tier/class response operator}
\rightarrow
\text{rectified displayed interval}
}
\tag{51}
\]

with

\[
D_F \text{ scalar},
\qquad
\boldsymbol\omega\in\Delta_{p-1}\cdot p,
\qquad
\Psi \text{ deterministic}.
\tag{52}
\]

Current uncertainty ordering:

\[
\text{allocation law}
>
\text{programme dose law}
>
\text{Reward scale}
>
\text{response geometry}
>
\text{tier transform}.
\tag{53}
\]

Here \(>\) means "more unresolved than".

---

# XII. Falsification programme

## Test A - Equal allocation

\[
\omega_j=1.
\]

## Test B - Stat-only allocation

\[
\omega_j
=
\frac{p e^{\theta_j}}
{\sum_{k\in S}e^{\theta_k}}.
\tag{54}
\]

## Test C - Original-role allocation

\[
\omega_j
=
\frac{p e^{\theta_{r_0,j}}}
{\sum_{k\in S}e^{\theta_{r_0,k}}}.
\tag{55}
\]

Required control: same age/tier/programme/multiplier/target-shape, differing original role.

## Test D - Acquired-role increment

\[
\omega_j
\propto
\exp\left(
\theta_{r_0,j}
+
\sum_{r\in R_*\setminus\{r_0\}}\lambda_{r,j}
\right).
\tag{56}
\]

Reject \(\lambda\ne0\) unless completed-role contrasts require it.

## Test E - Programme-specific dose

\[
(q_D,\eta_D)\ne(q_S,\eta_S)
\tag{57}
\]

only if Drill Session and Skill Seminar held-outs separate them.

Provisional Skill Seminar behaviour

\[
D_S\propto N^{1.4\text{-}1.5}/p^{0.7\text{-}0.8}
\tag{58}
\]

remains a hypothesis until identified without allocation compensation.

---

# XIII. Evidence discipline

For every observation \(e\),

\[
\text{prediction timestamp}<\text{observation timestamp}.
\tag{59}
\]

Prospective evidence remains prospective after promotion:

\[
\text{originPartition}\ne\text{currentPartition}.
\tag{60}
\]

Exact duplicate evidence is retained but has unit empirical weight:

\[
w_e=
\begin{cases}
1,&e\text{ canonical},\\
0,&e\text{ exact duplicate for fitting}.
\end{cases}
\tag{61}
\]

Prediction-model multiplicity does not multiply observation weight:

\[
\#\{\text{models scored on }e\}
\not\Rightarrow
w_e>1.
\tag{62}
\]

The target set is evidence, not metadata:

\[
S\ne f(\text{coach category})
\tag{63}
\]

unless the game itself establishes such a law.

---

# XIV. Constants frozen for the first automated run

| Symbol | Frozen value | Status |
|---|---:|---|
| \(\Delta_T\) | 0,10,30,50,80,120,160 | deterministic tier transform |
| \(K\) | 39.4242478510 | V2 response constant |
| \(\rho\) | 1.515276306526 | V2 upper/lower exposure ratio |
| \(\gamma_G\) | 0.685727303333 | V2 grey exposure multiplier |
| \(h_W\) | 135 | candidate threshold |
| \(h_G\) | 120 | candidate threshold |
| \(\beta\) | 0.0354 | candidate marginal-cost slope |
| \(q\) | 1.056 | shared-dose null |
| \(\eta\) | 1.073 | shared-dose null |
| \(\kappa_R\) | 0.60 | Reward test value only |

No value in the final five rows is promoted by this document.

---

# XV. Pre-registration statement

The first automated corpus run shall test, in order,

\[
H_0:\omega_j=1,
\]

\[
H_1:\omega_j=\omega_j(\text{stat}),
\]

\[
H_2:\omega_j=\omega_j(r_0,\text{stat}),
\]

\[
H_3:\omega_j=\omega_j(R_*,\text{stat}),
\]

while holding the response operator fixed.

Only after allocation has been isolated shall \((q_F,\eta_F)\), Focused coefficients, Reward scaling, or programme-family response terms be reopened.

\[
\boxed{
\text{Can a conserved session dose, non-uniformly allocated, explain the corpus under one deterministic response operator?}
}
\tag{64}
\]

That is Raymond's experimental hypothesis as frozen immediately before automated falsification.
